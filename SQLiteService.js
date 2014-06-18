App
.factory('SQLiteService', function(GENERAL_CONFIG, DB_CONFIG, LocalStorageService) {

    var
    
    APP_NAME = (GENERAL_CONFIG.APP_NAME + "_"),
    _db,
    
    /* query methods */
//    _executeSQL = function(sql, callback) {
    _executeSQL = function(sql, data, callback) {
        if(arguments.length === 2 && typeof(data) === "function"){
            var callback = data;
            // main DB method which makes query to DB
            _db.transaction(function(tx){
                _queryDB(tx, sql, [], callback);
            }, function(err){
                _errorCB(err, sql, callback);
            });
        }else{
            _db.transaction(function(tx){
                _queryDB(tx, sql, data, callback);
            }, function(err){
                _errorCB(err, sql, callback);
            });
        }
    },

    _querySuccess = function(tx, results, callback){
        console.log("_querySuccess");
        try{
            results.insertId;
            return callback(results);
        }catch(e){
            var len = results.rows.length, db_result = [];
            if(results.rows.length > 0)
                for(var i = 0; i < len; i++)
                    db_result[i] = results.rows.item(i);
            return (callback ? callback(db_result) : true);
        }
    },

    _queryDB = function(tx, sql, data, callback) {
        tx.executeSql(sql, data, function(tx, results){
            _querySuccess(tx, results, callback);
        }, function(err){
            _errorCB(err, sql, data, callback);
        });
    },

    _errorCB = function(err, sql, data, callback) {
        console.log("Error processing SQL, error & sql below:");
        console.log(err);
        console.log(sql);
        console.log(data);
        if(is_set(callback))callback({error:err});
    },
            
    __init_db = function(appName, db_name, db_tables, db_tables_sql, clear) {
        console.log("DB INIT STARTED");
        if(appName && db_name && db_tables && db_tables_sql){
            _db = window.openDatabase(db_name, DB_CONFIG.VERSION, DB_CONFIG.SUB_NAME, DB_CONFIG.SIZE);
            if(LocalStorageService.get("db_inited") !== "true" || is_set(clear)){
                console.log("recreated");
                db_tables.forEach(function(v){
                    _executeSQL('DROP TABLE IF EXISTS '+v);
                });
                console.log(db_tables_sql);
                db_tables_sql.forEach(function(v){
                    _executeSQL(v, function(){
                        LocalStorageService.set("db_inited", "true"); 
                    });
                });
                
//                if(!LocalStorageService.get("db_inited")){
//                    LocalStorageService.clear();
                    if(DB_CONFIG.TABLES_WITH_TRIGGERS && DB_CONFIG.TABLES_WITH_TRIGGERS.length > 0)
                        DB_CONFIG.TABLES_WITH_TRIGGERS.forEach(function(tb){
                                 _executeSQL('CREATE TRIGGER insert_' + tb + ' AFTER INSERT ON ' + tb + ' FOR EACH ROW BEGIN INSERT INTO sync(table_name, row_id, rowcreated, rowdeleted) VALUES("' + tb + '", NEW.id, 1, 0); END; ');
                                 _executeSQL('CREATE TRIGGER update_' + tb + ' AFTER UPDATE ON ' + tb + ' FOR EACH ROW BEGIN INSERT INTO sync(table_name, row_id, rowdeleted) VALUES("' + tb + '", NEW.id, 0); END; ');
                                 _executeSQL('CREATE TRIGGER delete_' + tb + ' AFTER DELETE ON ' + tb + ' FOR EACH ROW BEGIN INSERT INTO sync(table_name, row_id, rowdeleted) VALUES("' + tb + '", OLD.id, 1); END; ');
//                                DB_CONFIG.CREATE_SQL.push('CREATE TRIGGER update_' + tb + ' AFTER UPDATE ON ' + tb + ' FOR EACH ROW BEGIN INSERT INTO sync(table_name, row_id, rowcreated) VALUES("' + tb + '", NEW.id, 1); END; ');
//                                DB_CONFIG.CREATE_SQL.push('CREATE TRIGGER insert_' + tb + ' AFTER INSERT ON ' + tb + ' FOR EACH ROW BEGIN INSERT INTO sync(table_name, row_id) VALUES("' + tb + '", NEW.id); END; ');
                            LocalStorageService.set("sync_"+tb, 0);
                        });
                    LocalStorageService.set("lastSync", 0);
//                }
                
                
            }
            console.log("DB INIT FINISHED");
            return true;
        }else return false;
    },
    /* query methods */
    
    
    SQLite = function(){ // works with local SQLite DB 
      // DB is normally triggered via API
      // but we often need to make several DB opeartion and then sync all the stuff at one time
      // in this case we use manually API._sync after all
      var

      _sql = "",

      select = function(data) {
          var select = (data ? data : "*");
          return _sql = 'SELECT ' + select + ' ';
      },
      from = function(table) {
          _sql += ' FROM ' + table;
      },
      where = function(where) {
          _sql += (_sql.match(/( WHERE )/g) ? " AND " : " WHERE ");
          return _sql += where;
      },
      where_in = function(field, values) {
          _sql += (_sql.match(/( WHERE )/g) ? " AND " : " WHERE ");
          var where = field+" IN (";
          values.forEach(function(v,k){
              where += ( k === 0 ? v : (", "+v) );
          });
          return _sql += (where+")");
      },
      join = function(table, on) {
          return _sql += ' INNER JOIN ' + table + ' ON ' + on;
      },
      left_join = function(table, on) {
          return _sql += ' LEFT JOIN ' + table + ' ON ' + on;
      },
      order_by = function(order) {
          return _sql += ' ORDER BY ' + order;
      },
      order_by_desc = function(order) {
          return _sql += ' ORDER BY ' + order + ' DESC';
      },
      group_by = function(group) {
          return _sql += ' GROUP BY ' + group;
      },
      having = function(having) {
          return _sql += ' HAVING ' + having;
      },
      limit = function(limit, offset) {
          return _sql += ' LIMIT ' + limit + (offset ? (" OFFSET " + offset) : "");
      },
      query = function(callback) {
          _executeSQL(_sql, callback);
      },
      row = function(callback) {
          // return one row
          _executeSQL(_sql + ' LIMIT 1', function(data) {
              callback(data[0]);
          });
      },
      col = function(callback) {
          // return one col
          _executeSQL(_sql + ' LIMIT 1', function(data) {
              if(data.length > 0 ){
                  for (var i in data[0]) {
                      callback(data[0][i]);
                      break;
                  }
              }else callback([]);
          });
      },
      insert_or_ignore = function(table, data, callback) {
          var sql = 'INSERT OR IGNORE INTO ' + table + ' (', i = 0;
          for (var key in data) {
              sql += (i == 0 ? key : "," + key);
              ++i;
          }
          i = 0;
          sql += ') VALUES (';
          for (var key in data) {
            sql += (i == 0 ? "'" + data[key] + "'" : ",'" + data[key] + "'");
//              sql += (i == 0 ? '"' + data[key] + '"' : ',"' + data[key] + '"');
              ++i;
          }
          sql += ')';
          return (callback ? _executeSQL(sql, function(res) {
              callback(res.insertId);
          }) : _executeSQL(sql));
      },
      insert = function(table, data, callback) {
          var sql = 'INSERT INTO ' + table + ' (', i = 0, values = [];
          for (var key in data) {
              sql += (i == 0 ? key : "," + key);
              ++i;
          }
          i = 0;
          sql += ') VALUES (';
          for (var key in data) {
            sql += (i == 0 ? "?" : ",?");
            values.push(data[key]);
//            sql += (i == 0 ? "'" + data[key] + "'" : ",'" + data[key] + "'");
//              sql += (i == 0 ? '"' + data[key] + '"' : ',"' + data[key] + '"');
              ++i;
          }
          sql += ')';
          return (callback ? _executeSQL(sql, values, function(res) {
              callback(res.insertId);
          }) : _executeSQL(sql, values));
      },
      batch_insert = function(table, data, callback) {
          if (typeof table != "string")
              return false; // table is a string not an array
          if (data instanceof Array === false)
              return false; // data is array here
          var i = 0, _this = this, sql = 'INSERT INTO ' + table + ' (id';
          for (var key in data[0]) {
              sql += "," + key;
          }
          sql += ')';
          for (var j in data) {
              for (var ij in data[j]) {
                  if (i == 0) {
                      j == 0 ? sql += " SELECT '" + _this._make_id(table) + "' as id" : sql += " UNION SELECT '" + _this._make_id(table) + "' as id";
                  }
                  if (j == 0) {
                      sql += ", '" + data[j][ij] + "' as " + ij + ""
                  } else {
                      sql += ", '" + data[j][ij] + "'";
                  }
                  ++i;
              }
              i = 0;
          }
          return (
                  callback ? _executeSQL(sql, function() {
              callback();
          }) : _executeSQL(sql)
                  );
      },
      batch_insert_or_ignore = function(table, data, callback) {
          if (typeof table != "string")
              return false; // table is a string not an array
          if (data instanceof Array === false)
              return false; // data is array here
          var i = 0, _this = this, sql = 'INSERT OR IGNORE INTO ' + table + ' (', ij = 0;
          for (var key in data[0]) {
              if (ij != 0) {
                  sql += ",";
              }
              sql += key;
              ++ij;
          }
          var ijk = 0;
          sql += ')';
          for (var j in data) {
              for (var ij in data[j]) {
                  if (i == 0) {
                      j == 0 ? sql += ' SELECT ' : sql += ' UNION SELECT ';
                  }
                  if (j == 0) {
                      if (ijk != 0) {
                          sql += ",";
                      }
                      sql += (data[j][ij] === null ? (data[j][ij] + ' as ' + ij) : ('"' + data[j][ij] + '" as ' + ij + '') );
                  } else {
                      if (ijk != 0) {
                          sql += ",";
                      }
                      sql += (data[j][ij] === null ? data[j][ij] : ('"' + data[j][ij] + '"'));
                  }
                  ++i;
                  ++ijk;
              }
              i = 0;
              ijk = 0;
          }
          return (
                  callback ? _executeSQL(sql, function() {
              callback();
          }) : _executeSQL(sql)
                  );
      },
      batch_insert_with_id = function(table, data, callback) {
          if (typeof table != "string")
              return false; // table is a string not an array
          if (data instanceof Array === false)
              return false; // data is array here
          var i = 0, _this = this, sql = 'INSERT INTO ' + table + ' (', ij = 0;
          for (var key in data[0]) {
              if (ij != 0) {
                  sql += ",";
              }
              sql += key;
              ++ij;
          }
          var ijk = 0;
          sql += ')';
          for (var j in data) {
              for (var ij in data[j]) {
                  if (i == 0) {
                      j == 0 ? sql += ' SELECT ' : sql += ' UNION SELECT ';
                  }
                  if (j == 0) {
                      if (ijk != 0) {
                          sql += ",";
                      }
                      sql += '"' + data[j][ij] + '" as ' + ij + ''
                  } else {
                      if (ijk != 0) {
                          sql += ",";
                      }
                      sql += '"' + data[j][ij] + '"';
                  }
                  ++i;
                  ++ijk;
              }
              i = 0;
              ijk = 0;
          }
          return ( callback ? _executeSQL(sql, callback) : _executeSQL(sql) );
      },
      batch_insert_or_ignore_with_id = function(table, data, callback) {
          if (typeof table != "string")
              return false; // table is a string not an array
          if (data instanceof Array === false)
              return false; // data is array here
          var i = 0, _this = this, sql = 'INSERT OR IGNORE INTO ' + table + ' (', ij = 0;
          for (var key in data[0]) {
              if (ij != 0) {
                  sql += ",";
              }
              sql += key;
              ++ij;
          }
          var ijk = 0;
          sql += ')';
          for (var j in data) {
              for (var ij in data[j]) {
                  if (i == 0) {
                      j == 0 ? sql += ' SELECT ' : sql += ' UNION SELECT ';
                  }
                  if (j == 0) {
                      if (ijk != 0) {
                          sql += ",";
                      }
                      sql += '"' + data[j][ij] + '" as ' + ij + ''
                  } else {
                      if (ijk != 0) {
                          sql += ",";
                      }
                      sql += '"' + data[j][ij] + '"';
                  }
                  ++i;
                  ++ijk;
              }
              i = 0;
              ijk = 0;
          }
          return ( callback ? _executeSQL(sql, callback) : _executeSQL(sql) );
      },
      update = function(table, data, where, callback) {
//        console.log("update")
//        console.log(table)
//        console.log(data)
//        console.log(where)
          var i = 0, j = 0, sql = "", sql = "UPDATE " + table + " SET ";
          for (var key in data) {
              if (i != 0) {
                  sql += ",";
              }
                                  // ---
                                  if (data[key] == 'datetime()') {
                                          sql += key + '=' + data[key];
                                  } else {
                                        sql += (key + '='+ ( data[key] === null ? data[key] : ("'" + data[key] + "'")) );
//                                          sql += (key + '='+ ( data[key] === null ? data[key] : ('"' + data[key] + '"')) );
                                  }
                                  // ---
              ++i;
          }
          if (where != "" && where != false) {
              if(typeof(where) === "string")
                  sql += " WHERE " + where;
              else{//object
                  var _where = "";
                  for(var wi in where)
                      _where += ( _where === "" ? (wi+'= "'+where[wi]+'"') : (' AND ' + wi+'="'+where[wi]+'"') );
                  sql += " WHERE "+_where;
              }
          }

          return (
              callback ? _executeSQL(sql, function() {
                  callback();
              }) : _executeSQL(sql)
          );
      },
      remove = function(table, where, callback) {
            var sql = 'DELETE FROM ' + table;
          
            if( (arguments.length === 3 || (arguments.length === 2 && typeof(where) !== "function")) && typeof(where) !== "undefined" )
                sql+= ' WHERE ' + where;
            else if(arguments.length === 2 && typeof(where) === "function"){
                var callback = where;
            }
          
          return (
                  callback ? _executeSQL(sql, function() {
              callback();
          }) : _executeSQL(sql)
                  );
      },
      batch_remove = function(table, data, callback) {
          var sql = 'DELETE FROM ' + table + ' WHERE id IN (';
          data.forEach(function(row, i) {
              sql += (i == 0 ? '"' + row.id + '"' : ',"' + row.id + '"');
          });
          sql += ")";
          return (
                  callback ? _executeSQL(sql, function() {
              callback();
          }) : _executeSQL(sql)
                  );
      },
      replace = function(table, data, callback) {
          var i = 0, j = 0, sql = "", all_sql = "REPLACE INTO " + table + " ( ";
          for (var str in data) {
              if (i != 0) {
                  all_sql += ",";
              }
              all_sql += str;
              ++i;
          }
          all_sql += ") VALUES (";

          for (var i in data) {
              if (j != 0) {
                  sql += ',';
              }
              sql += '"' + data[i] + '"';
              ++j;
          }
          all_sql += sql + ')';

          return (
                  callback ? _executeSQL(sql, function() {
              callback();
          }) : _executeSQL(sql)
                  );
      },
      batch_replace = function(table, data, callback) {
          var i = 0, sql = "REPLACE INTO " + table + " ( ";
          for (var key in data[0]) {
              if (i != 0) {
                  sql += ",";
              }
              sql += key;
              ++i;
          }
          sql += ") ", i = 0;
          for (var j in data) {
              for (var ij in data[j]) {
                  if (i == 0) {
                      j == 0 ? sql += ' SELECT ' : sql += ' UNION SELECT ';
                  } else {
                      sql += ",";
                  }
                  if (j == 0) {
                      sql += ' "' + data[j][ij] + '" as ' + ij + ''
                  } else {
                      sql += ' "' + data[j][ij] + '"';
                  }
                  ++i;
              }
              i = 0;
          }
          return (
                  callback ? _executeSQL(sql, function() {
              callback();
          }) : _executeSQL(sql)
                  );
      },
      insert_batch_on_duplicate_update = function(table, data, callback) {
//      insert_batch_on_duplicate_update = function(table, data, timeForUpdate, callback) {
//          console.log(table);
//          console.log(data);
/*
          if(typeof(timeForUpdate) === "number"){
              var lastUpdateTime = (function(tt){
                  var nd = new Date(tt);

                  var year = nd.getFullYear(),
                      month = (nd.getMonth()+1),
                      date = nd.getDate();
                  if(month < 10)month = "0"+month;
                  if(date < 10)date = "0"+date;

                  return ( year+"-"+month+"-"+date+" "+"00:00" );
              }(timeForUpdate));
          }
*/
          var _this = this, len = data.length;
          batch_insert_or_ignore(table, data, function(){
                if(is_array(data))
                    data.forEach(function(row, i) {
                        if (i == len - 1) {
                            update(table, row, 'id = "' + row.id + '"', callback);
                        } else {
                            update(table, row, 'id = "' + row.id + '"');
                        }
                    });
                else
                    update(table, data, 'id = "' + data.id + '"', callback);
  //            data.forEach(function(row, i) {
  //                if (i == len - 1) {
  //                    update(table, row, 'id = "' + row.id + '" AND updatetime < "'+lastUpdateTime+'"', callback);
  //                } else {
  //                    update(table, row, 'id = "' + row.id + '" AND updatetime < "'+lastUpdateTime+'"');
  //                }
  //            });
          });
      },
      insert_on_duplicate_update = function(table, data, callback) {
          insert_or_ignore(table, data, function(){
              update(table, data, 'id = "' + data.id + '"', callback);
          });
      };
        

        return {
            _executeSQL     : _executeSQL,
            select          : select,
            from            : from,
            where           : where,
            where_in        : where_in,
            order_by        : order_by,
            group_by        : group_by,
            order_by_desc   : order_by_desc,
            limit           : limit,
            having          : having,
            join            : join,
            left_join       : left_join,
            query           : query,
            row             : row,
            col             : col,
            insert          : insert,
            update          : update,
            remove          : remove,
            insert_batch_on_duplicate_update          : insert_batch_on_duplicate_update,
            insert_on_duplicate_update                : insert_on_duplicate_update,
            recreate_db : function() {
                console.log("start recreate_db");
                __init_db(  GENERAL_CONFIG.APP_NAME,
                            DB_CONFIG.DB_NAME,
                            DB_CONFIG.TABLES,
                            DB_CONFIG.CREATE_SQL,
                            true  );
            }
        };
          
    };
    
//    if(!LocalStorageService.get("db_inited")){
////        LocalStorageService.clear();
//        if(DB_CONFIG.TABLES_WITH_TRIGGERS && DB_CONFIG.TABLES_WITH_TRIGGERS.length > 0)
//            DB_CONFIG.TABLES_WITH_TRIGGERS.forEach(function(tb){
//                    DB_CONFIG.CREATE_SQL.push('CREATE TRIGGER update_' + tb + ' AFTER UPDATE ON ' + tb + ' FOR EACH ROW BEGIN INSERT INTO sync(table_name, row_id, rowcreated) VALUES("' + tb + '", NEW.id, 1); END; ');
//                    DB_CONFIG.CREATE_SQL.push('CREATE TRIGGER insert_' + tb + ' AFTER INSERT ON ' + tb + ' FOR EACH ROW BEGIN INSERT INTO sync(table_name, row_id) VALUES("' + tb + '", NEW.id); END; ');
//                LocalStorageService.set("sync_"+tb, 0);
//            });
//        LocalStorageService.set("lastSync", 0);
//    }
    
    /* INIT */
    __init_db(  GENERAL_CONFIG.APP_NAME,
                DB_CONFIG.DB_NAME,
                DB_CONFIG.TABLES,
                DB_CONFIG.CREATE_SQL,
                DB_CONFIG.RECREATE_DB  );
    /* INIT */
    
    return SQLite;
});