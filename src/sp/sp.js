﻿sp = {
    _context: null,
    _getSpContext: function (url, createNew) {
        if ($sspjs.sp._context === null || createNew === true) {
            if (!url) {
                $sspjs.sp._context = SP.ClientContext.get_current();
            }
            $sspjs.sp._context = new SP.ClientContext(url);
        }
        return $sspjs.sp._context;
    },
    _getWeb: function (params) {
        var ctx = $sspjs.sp._getSpContext(params);
        return ctx.get_web();
    },
    _getList: function (params) {
        var web = $sspjs.sp._getWeb(params);
        return web.get_lists().getByTitle(params.listname);
    },
    _getItem: function (params) {
        var list = $sspjs.sp._getList(params);
        return list.getItemById(params.id);
    },
    _executeAsync: function (loadArr, success, error) {
        var ctx = $sspjs.sp._getSpContext();

        if (loadArr) {
            for (var i = 0; i < loadArr.length; i++) {
                ctx.load(loadArr[i]);
            }
        }
        ctx.executeQueryAsync(success, error);
    },
    _getFileBufferAsync: function (filename) {
        var dfd = $.Deferred();
        var reader = new FileReader();
        reader.onloadend = function (e) {
            dfd.resolve(e.target.result);
        }
        reader.onerror = function (e) {
            dfd.reject(e.target.error);
        }
        reader.readAsArrayBuffer(filename);
        return dfd.promise();
    },
    _addFileToFolderAsync: function (filename, path, arrayBuffer) {
        var dfd = new $.Deferred();
        var parts = filename.split('\\');
        var fileName = parts[parts.length - 1];
        var fileCollectionEndpoint =
            $sspjs.config.siteRelativeUrl + "_api/web/getfolderbyserverrelativeurl('" + path + "')/files" +
            "/add(overwrite=true, url='" + fileName + "')";

        $.ajax({
            url: fileCollectionEndpoint,
            type: "POST",
            data: arrayBuffer,
            processData: false,
            headers: {
                "accept": "application/json;odata=verbose",
                "X-RequestDigest": $("#__REQUESTDIGEST").val(),
                // "content-length": arrayBuffer.byteLength
            },
            success: function (data, status, xhr) {
                dfd.resolve(data.d, status, xhr);
            },
            error: function (xhr, ajaxOptions, thrownError) {
                dfd.reject(xhr, ajaxOptions, thrownError);
            }
        });

        return dfd.promise();
    },
    initContext: function (url) {
        /// <summary>Creates a new SharePoint Client Context.</summary>
        /// <returns type="SP.Context">The Context.</returns>
        var ctx = $sspjs.sp._getSpContext(url);
        return ctx;
    },
    getCurrentUserAsync: function () {
        /// <summary>Request the current user accessing SharePoint.</summary>
        /// <returns type="User">The User (id, name, email, login)</returns>

        var CACHE_KEY = 'CURRENT_USER';

        var dfd = new $.Deferred();
        var userFromCache = $sspjs.cache.get(CACHE_KEY);
        if (userFromCache && userFromCache.login) {
            $sspjs.logger.log('Current user from cache: ' + userFromCache.login)
            dfd.resolve(userFromCache);
            return dfd.promise();
        }

        var ctx = $sspjs.sp._getSpContext();
        var oWeb = ctx.get_web();
        var usr = oWeb.get_currentUser();
        ctx.load(usr);
        ctx.load(oWeb, 'EffectiveBasePermissions');
        ctx.executeQueryAsync(Function.createDelegate(this, function (sender, args) {
            currentUser = {
                id: usr.get_id(),
                name: usr.get_title(),
                email: usr.get_email(),
                login: usr.get_loginName()
            };
            if (oWeb.get_effectiveBasePermissions().has(SP.PermissionKind.editListItems)) {
                currentUser.readonly = false;
            } else {
                currentUser.readonly = true;
            }
            $sspjs.cache.set(CACHE_KEY, currentUser);
            dfd.resolve(currentUser);
        }), Function.createDelegate(this, function (sender, args) {
            currentUser = null;
            dfd.reject(sender, args.get_message(), args);
        }));

        return dfd.promise();
    },
    hasPermissionAsync: function (permission) {
        var dfd = new $.Deferred();
        var ctx = $sspjs.sp._getSpContext();
        var oWeb = ctx.get_web();
        var usr = oWeb.get_currentUser();
        ctx.load(usr);
        ctx.load(oWeb, 'EffectiveBasePermissions');
        ctx.executeQueryAsync(Function.createDelegate(this, function (sender, args) {
            if (oWeb.get_effectiveBasePermissions().has(permission)) {
                dfd.resolve(true);
            } else {
                dfd.resolve(false);
            }
        }), Function.createDelegate(this, function (sender, args) {
            dfd.reject(sender, args.get_message(), args);
        }));

        return dfd.promise();
    },
    setWebPropertyAsync: function (key, value) {
        /// <summary>Save a value to the WebSite's Property Bag.</summary>
        /// <param name="key" type="String">Key to access the Property Bag value.</param>
        /// <param name="value" type="String">Value which should be stored to the Propery Bag.</param>
        var dfd = new $.Deferred();
        var web = $sspjs.sp._getWeb();
        var props = web.get_allProperties();

        props.set_item(key, value + '');
        web.update();

        $sspjs.sp._executeAsync([web], function (sender, args) {
            dfd.resolve(args);
        }, function (sender, args) {
            dfd.reject(sender, args.get_message(), args);
        });

        return dfd.promise();
    },
    getWebPropertyAsync: function (key) {
        /// <summary>Get a value from the WebSite's Property Bag.</summary>
        /// <param name="key" type="String">Key to access the stored value.</param>
        /// <returns type="String">The value from the Property Bag.</returns>
        var dfd = new $.Deferred();
        var web = $sspjs.sp._getWeb();
        var props = web.get_allProperties();

        $sspjs.sp._executeAsync([web, props], function (sender, args) {
            var value = props.get_item(key);
            dfd.resolve(value);
        }, function (sender, args) {
            dfd.reject(sender, args);
        });

        return dfd.promise();
    },
    getWebPropertiesAsync: function (keysArray) {
        /// <summary>Get values from the WebSite's Property Bag.</summary>
        /// <param name="keys" type="String[]">Keys to access the stored values.</param>
        /// <returns type="String[]">The values from the Property Bag.</returns>
        var dfd = new $.Deferred();
        var web = $sspjs.sp._getWeb();
        var props = web.get_allProperties();

        $sspjs.sp._executeAsync([web, props], function (sender, args) {
            var result = {};
            for (var i = 0; i < keysArray.length; i++) {
                try {
                    var val = props.get_item(keysArray[i]);
                    if (val !== undefined && val !== null) {
                        result[keysArray[i]] = val;
                    }
                } catch (err) {
                    $sspjs.logger.log(err);
                }
            }
            dfd.resolve(result);
        }, function (sender, args) {
            dfd.reject(sender, args);
        });

        return dfd.promise();
    },
    getListFieldsAsync: function (listname) {
        /// <summary>Get all VISIBLE fields from the specified list.</summary>
        /// <param name="listname" type="String">The listname.</param>
        /// <returns type="SP.Field[]">The list fields.</returns>
        var dfd = new $.Deferred();

        var CACHE_KEY = 'LIST_FIELDS_' + listname;
        var fieldsFromCache = $sspjs.cache.get(CACHE_KEY);
        if (fieldsFromCache && fieldsFromCache.length) {
            $sspjs.logger.log('Fields from cache: ' + fieldsFromCache.length)
            dfd.resolve(fieldsFromCache);
            return dfd.promise();
        }

        var list = $sspjs.sp._getList({ listname: listname });
        var fields = list.get_fields();

        $sspjs.sp._executeAsync([fields], function (sender, args) {
            var fieldEnumerator = fields.getEnumerator();
            var result = [];
            while (fieldEnumerator.moveNext()) {
                var field = fieldEnumerator.get_current();

                if (field.get_hidden() != true) {
                    result.push({
                        internalName: field.get_internalName(),
                        title: field.get_title(),
                        type: (field.get_fieldTypeKind() == 0 && field.get_typeAsString() === 'TaxonomyFieldType' ? 1000 : field.get_fieldTypeKind())
                    });
                }
            }
            $sspjs.logger.log(result.length + ' fields received.');
            $sspjs.cache.set(CACHE_KEY, result);
            dfd.resolve(result);
        }, function (sender, args) {
            dfd.reject(sender, args.get_message(), args);
        });

        return dfd.promise();
    },
    getListItemsAsync: function (listname, fields, viewXml, rowlimit) {
        /// <summary>Get fields from the specified list.</summary>
        /// <param name="listname" type="String">The listname.</param>
        /// <param name="fields" type="String[]">Which fields should be requested.</param>
        /// <param name="viewXml" type="String">(OPTIONAL) The view xml.</param>
        /// <param name="rowlimit" type="Number">(OPTIONAL) The rowlimit. Only works if 'viewXml' is null.</param>
        /// <returns type="SP.ListItem[]">The list items.</returns>
        if (!rowlimit)
            rowlimit = 100;
        var dfd = new $.Deferred();
        var ctx = new $sspjs.sp._getSpContext();
        var list = ctx.get_web().get_lists().getByTitle(listname);
        var camlQuery = new SP.CamlQuery();
        camlQuery.set_viewXml('<View><RowLimit>' + rowlimit + '</RowLimit></View>');
        if (viewXml)
            camlQuery.set_viewXml(viewXml);
        var collListItem = list.getItems(camlQuery);

        if (fields !== undefined && fields !== null) {
            $sspjs.logger.log('requested fields: ' + fields.join(', '));
            ctx.load(collListItem, 'Include(' + fields.join(', ') + ')');
        } else {
            ctx.load(collListItem);
        }
        ctx.executeQueryAsync(Function.createDelegate(this, function (sender, args) {
            var result = [];
            var listItemEnumerator = collListItem.getEnumerator();
            while (listItemEnumerator.moveNext()) {
                var items = listItemEnumerator.get_current();
                result.push(items);
            }
            $sspjs.logger.log(result.length + ' items received.');
            dfd.resolve(result);
        }), Function.createDelegate(this, function (sender, args) {
            dfd.reject(sender, args.get_message(), args);
        }));

        return dfd.promise();
    },
    getListItemByIdAsync: function (listname, id, fields, isFile) {

        if (!fields)
            fields = [];

        var file;
        var dfd = new $.Deferred();
        var ctx = new $sspjs.sp._getSpContext();
        var list = ctx.get_web().get_lists().getByTitle(listname);
        var item = list.getItemById(id);
        if (isFile === true) {
            fields = ['File', 'FileSystemObjectType'];
        }

        if (fields && fields.length > 0) {
            fields.splice(0, 0, item);
            ctx.load.apply(ctx, fields);
        } else {
            ctx.load(item);
        }

        ctx.executeQueryAsync(function (sender, args) {
            if (isFile === true) {
                file = item.get_file();
                dfd.resolve(file.get_serverRelativeUrl());
            } else {
                dfd.resolve(item);
            }
        }, function (sender, args) {
            dfd.reject(sender, args.get_message(), args);
        });

        return dfd.promise();
    },
    getListItemByFileUrlAsync: function (url) {
        var dfd = new $.Deferred();
        $.ajax({
            url: url,
            type: "GET",
            headers: { "accept": "application/json;odata=verbose" },
            success: function (data) {
                dfd.resolve(data.d);
            },
            error: function (xhr, ajaxOptions, thrownError) {
                dfd.reject(this, 'no item found.', { xhr: xhr, ajax: ajaxOptions, error: thrownError });
            }
        });
        return dfd.promise();
    },
    addListItemAsync: function (listname, item, setPropertiesFunc) {
        var dfd = new $.Deferred();
        var list = $sspjs.sp._getList({ listname: listname });

        var itemCreateInfo = new SP.ListItemCreationInformation();
        var newItem = list.addItem(itemCreateInfo);

        for (var property in item) {
            if (item[property] !== undefined && item[property] !== null)
                newItem.set_item(property, item[property]);
        }

        if (setPropertiesFunc && $.isFunction(setPropertiesFunc)) {
            setPropertiesFunc(newItem);
        }

        newItem.update();

        $sspjs.sp._executeAsync([newItem], function (sender, args) {
            dfd.resolve(newItem);
        }, function (sender, args) {
            dfd.reject(sender, args.get_message(), args);
        });

        return dfd.promise();
    },
    updateListItemAsync: function (listname, id, item, setPropertiesFunc) {
        var dfd = new $.Deferred();
        var list = $sspjs.sp._getList({ listname: listname });
        var uItem = list.getItemById(id);

        for (var property in item) {
            if (item[property] !== undefined && item[property] !== null && property !== 'Id') {
                uItem.set_item(property, item[property]);
            }
        }

        if (setPropertiesFunc && $.isFunction(setPropertiesFunc)) {
            setPropertiesFunc(uItem);
        }

        uItem.update();

        $sspjs.sp._executeAsync([uItem], function (sender, args) {
            dfd.resolve(uItem);
        }, function (sender, args) {
            dfd.reject(sender, args.get_message(), args);
        });

        return dfd.promise();
    },
    deleteListItemByIdAsync: function (listname, id) {
        var dfd = new $.Deferred();
        var list = new $sspjs.sp._getList({ listname: listname });
        var item = list.getItemById(id);
        item.deleteObject();

        $sspjs.sp._executeAsync(null, function (sender, args) {
            dfd.resolve(id);
        }, function (sender, args) {
            dfd.reject(sender, args.get_message(), args);
        });

        return dfd.promise();
    },
    getUserByIdAsync: function (userId) {
        /// <summary>Get user data by ID depending on the current SPSite.</summary>
        /// <param name="userId" type="Number">The user id of the current SPSite.</param>
        /// <returns type="User">The user.</returns>

        var dfd = new $.Deferred();

        var CACHE_KEY = 'USER' + userId;
        var userFromCache = $sspjs.cache.get(CACHE_KEY);
        if (userFromCache && userFromCache.login) {
            $sspjs.logger.log('User from cache: ' + userFromCache.login)
            dfd.resolve(userFromCache);
            return dfd.promise();
        }

        var web = $sspjs.sp._getWeb();
        var user = web.getUserById(userId);
        $sspjs.sp._executeAsync([user], function (sender, args) {
            var result = {
                id: user.get_id(),
                name: user.get_title(),
                email: user.get_email(),
                login: user.get_loginName()
            };
            $sspjs.cache.set(CACHE_KEY, result);
            dfd.resolve(result);
        }, function (sender, args) {
            dfd.reject(sender, args.get_message(), args);
        });

        return dfd.promise();
    },
    getUserLink: function (userId) {
        /// <summary>Get user details link by ID.</summary>
        /// <param name="userId" type="Number">The user id of the current SPSite.</param>
        /// <returns type="String">The link.</returns>

        return $sspjs.config.webAbsoluteUrl + $sspjs.config.layoutsUrl + 'userdisp.aspx?ID=' + userId;
    },
    loadUserDataAsync: function (accountName, properties) {
        /// <summary>Get user data by account name. Attention: Does only works with 'User Profile Service' running!</summary>
        /// <param name="accountName" type="String">The accountName.</param>
        /// <param name="properties" type="String[]">(OPTIONAL) Which properties should be requested.</param>
        /// <returns type="User">The user object with the selected properties .</returns>
        var dfd = new $.Deferred();

        var CACHE_KEY = 'USER' + accountName;
        var userDataFromCache = $sspjs.cache.get(CACHE_KEY);
        if (userDataFromCache && userDataFromCache.LargeImage) {
            $sspjs.logger.log('UserData from cache: ' + accountName)
            dfd.resolve(userDataFromCache);
            return dfd.promise();
        }


        if (!properties)
            properties = ["PreferredName", "PictureURL"];

        //Get Current Context	
        var clientContext = $sspjs.sp._getSpContext();
        //Get Instance of People Manager Class
        var peopleManager = new SP.UserProfiles.PeopleManager(clientContext);
        //Properties to fetch from the User Profile
        var profilePropertyNames = properties;

        //Create new instance of UserProfilePropertiesForUser
        var userProfilePropertiesForUser = new SP.UserProfiles.UserProfilePropertiesForUser(clientContext, accountName, profilePropertyNames);
        userProfileProperties = peopleManager.getUserProfilePropertiesFor(userProfilePropertiesForUser);

        //Execute the Query.
        clientContext.load(userProfilePropertiesForUser);
        clientContext.executeQueryAsync(Function.createDelegate(this, function (sender, args) {
            var userData = {};
            for (var i = 0; i < properties.length; i++) {
                userData[properties[i]] = userProfileProperties[i];
            }
            $sspjs.cache.set(CACHE_KEY, userData);
            dfd.resolve(userData);
        }), Function.createDelegate(this, function (sender, args) {
            dfd.reject(sender, 'can not load user data', args);
        }));
        return dfd.promise();
    },
    uploadFileAsync: function (libraryName, name, fileInput, path) {
        var dfd = new $.Deferred();

        var that = this;
        var folder = '' + libraryName + (!path ? '' : '/' + path);
        var getBufferAsync = $sspjs.sp._getFileBufferAsync(fileInput.files[0]);
        getBufferAsync.done(function (arrayBuffer) {
            var addFile = $sspjs.sp._addFileToFolderAsync(fileInput.value, folder, arrayBuffer);
            addFile.done(function (item, status, xhr) {
                var uri = item.ListItemAllFields.__deferred.uri + '';
                var getItem = $sspjs.sp.getListItemByFileUrlAsync(uri);
                getItem.done(function (item) {
                    dfd.resolve(item, uri);
                });
                getItem.fail(function (sender, message, args) {
                    dfd.reject(sender, message, args);
                });
            });
            addFile.fail(function (xhr, ajaxOptions, thrownError) {
                dfd.reject(that, "file can not be uploaded", { xhr: xhr, ajax: ajaxOptions, error: thrownError });
            });
        });
        getBufferAsync.fail(function (error) {
            dfd.reject(that, "file can not be converted", error);
        });

        return dfd.promise();
    },
    openModalDialogAsync: function (url) {
        var dfd = new $.Deferred();
        var options = SP.UI.$create_DialogOptions();
        options.url = url;
        options.dialogReturnValueCallback = Function.createDelegate(this, function (dialogResult, returnValue) {
            if (dialogResult == SP.UI.DialogResult.OK)
                dfd.resolve(returnValue);
            else
                dfd.reject(returnValue);
        });
        SP.UI.ModalDialog.showModalDialog(options);
        return dfd.promise();
    },
    closeModalDialog: function (returnValue) {
        window.frameElement.commitPopup('Hello from custom dialog page!');
    },
    notify: function (message) {
        SP.UI.Notify.addNotification(message, false);
    },
    addStatus: function (options) {
        if (!options.color) {
            options.color = 'yellow';
        }
        var statusID = SP.UI.Status.addStatus(options.title, options.message);
        SP.UI.Status.setStatusPriColor(statusID, options.color);
        return statusID;
    },
    removeStatus: function (id) {
        if (id) {
            SP.UI.Status.removeStatus(id);
        }
    },
    removeAllStatus: function () {
        SP.UI.Status.removeAllStatus(true);
    },
    getFileUrlAsync: function (listname, id) {
        var dfd = new $.Deferred();
        var getListItem = $sspjs.sp.getListItemByIdAsync(listname, id, null, true);
        getListItem.done(function (url) {
            dfd.resolve(url);
        });
        getListItem.fail(function (sender, message, args) {
            dfd.reject(sender, message, args);
        });

        return dfd.promise();
    },
    getFileHistoryAsync: function (listname, filePath) {
        var dfd = new $.Deferred();
        var web = $sspjs.sp._getWeb();
        var listItemInfo = web.getFileByServerRelativeUrl(filePath);
        var listItemFields = listItemInfo.get_listItemAllFields();
        $sspjs.sp._executeAsync([web, listItemInfo, listItemFields], function (sender, args) {
            var versions = listItemInfo.get_versions();
            $sspjs.sp._executeAsync([versions], function (sender, args) {
                var result = [];
                var versionsEnum = versions.getEnumerator();
                while (versionsEnum.moveNext()) {
                    var listItemVersion = versionsEnum.get_current();
                    result.push(listItemVersion);
                }
                dfd.resolve(result);
            }, function (sender, args) {
                dfd.reject(sender, args.get_message(), args);
            });
        }, function (sender, args) {
            dfd.reject(sender, args.get_message(), args);
        });

        return dfd.promise();
    }
}