const express = require("express");
const PORT = process.env.PORT || 3001;
const app = express();
var fs = require('fs');
const cors = require('cors');
const multer  = require('multer')
const { v4: uuidv4 } = require('uuid');
const { randomUUID } = require('crypto');
const { makeGif } = require('./gifMaker')
const path = require('path')


var sqlite3 = require("sqlite3");
const { URLSearchParams } = require("url");


const DBSOURCE = "usersdb.sqlite";

var db = new sqlite3.Database(DBSOURCE, (err) => {
    if (err) {
        // Cannot open database
        console.error(err.message)
        throw err
    } 
    else {
        // ** EXAMPLE **
        // ** For a column with unique values **
        // email TEXT UNIQUE, 
        // with CONSTRAINT email_unique UNIQUE (email)   

        db.run(`CREATE TABLE Images (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            Path TEXT,
            Post INTEGER
            )`, (err) => {
                if (err) {
                    //do nothing
                }
            });
        db.run(`CREATE TABLE Users (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            Username TEXT UNIQUE,
            Password TEXT
            )`, (err) => {
                if (err) {
                    //do nothing
                }
            });
        db.run(`CREATE TABLE Posts (
            Id INTEGER PRIMARY KEY AUTOINCREMENT,
            User TEXT UNIQUE,
            Path TEXT
            )`, (err) => {
                if (err) {
                    //do nothing
                }
            });
        db.run(`CREATE TABLE Friends (
            User_one TEXT,
            User_two TEXT,
            Status INTEGER
            )`, (err) => {
                if (err) {
                    //do nothing
                }
            });
    }
})


module.exports = db

app.use(
    express.urlencoded({ extended: false }),
    cors(),
    express.json(),
);

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'images');
    },
    filename: function (req, file, cb) {
      cb(null, file.fieldname + '-' + Date.now() + file.originalname.match(/\..*$/)[0]);
    },
  });

const upload = multer({ storage: storage, limits: { fieldSize: 25 * 1024 * 1024 }});


app.post('/upload', upload.array('images'), function (req, res, next) {
    console.log(req.body)
    var insert = 'REPLACE INTO Images (Path) VALUES (?)'

    for (let i = 0; i < req.files.length; i++) {
        db.run(insert, [req.files[i].path])
    }
    res.status(200).end('Your files uploaded.');
})

app.post('/upload_single', upload.single('image'), function (req, res, next) {
    var insert = 'REPLACE INTO Images (Path, Post) VALUES (?, ?)'

    db.run(insert, [req.file.path, req.body.postid])
    
    res.status(200).end('Your file uploaded.');
})

app.post('/login', (req, res) => {
    const username = req.body.username
    const password = req.body.password
    

    const sql = `SELECT * FROM Users WHERE Username = ? AND Password = ?`

    db.get(sql, [username, password], (err, row) => {
        if (err) {
            res.status(404).end('Account or password invalid')
            console.log(row)
        } else if (!row) {
            res.status(404).end('Account or password invalid')
            console.log("no row")
        } else {
            console.log("success")
            res.json({user: row.Username})
        }
    })
})

app.post('/register', (req, res) => {
    const username = req.body.username
    const password = req.body.password

    console.log(req.body)

    if (username && password) {
        const sql = `INSERT INTO Users (Username, Password) VALUES (?, ?)`

        db.run(sql, [username, password], (err) => {
            if (err) {
                res.status(404).end('User already exists')
            } else {
                res.json({user: username})
            }
        })
    } else {
        res.status(404)
    }

    
})

app.post('/create_post', (req, res) => {
    const user = req.body.user
    const sql = 'REPLACE INTO Posts (User) VALUES (?)'

    console.log(req.body)

    db.run(sql, [user], (err) => {
        if (err) {
            res.status(404)
        } else {
            db.get('SELECT Id id FROM Posts WHERE User = ?', [user], (err, row) => {
                if (err) {
                    res.status(404)
                } else {
                    console.log(row.id)
                    res.json({postid: row.id})
                }
            })
        }
    })

})




app.get('/:id/image', (req, res) => {

    const sql = `SELECT Path path FROM Images WHERE Id = ?`
    
    db.get(sql, [req.params.id], (err, row) => {
        if (err) {
            console.error(err.message)
        } else {
            fs.readFile(row.path, function(err, data) {
                res.set('Content-Type', 'image/png')
                res.send(data);
            });
        }
    })

        // res.set('Content-Type', 'image/png')
        // res.send(img)
})

app.get('/make_gif', (req, res) => {
    const sql = `SELECT Path path FROM Images WHERE Post = ?`
    let image_paths = []
    const postid = req.query.postid

    db.all(sql, [postid], async (err, rows) => {
        if (err) {
            console.error(err.message)
        } else {
            let i = 0
            rows.forEach((row) => {
                image_paths[i] = row.path
                i += 1
            })
            const output = path.join(__dirname, `/gifs/${postid}.gif`)
            makeGif(image_paths, output)
            const query = 'UPDATE Posts SET Path = ? WHERE Id = ?'
            db.run(query, [output, postid], (err) => {
                if (err) {
                    console.log(err)
                } else {
                    res.sendStatus(200)
                }
            })
        }
    })
})

app.get('/gif', (req, res) => {
    const user = req.query.user
    const sql = 'SELECT Path path FROM Posts WHERE User = ?'

    if (!user) {
        res.sendStatus(404)
    } else {
        db.get(sql, [user], (err, row) => {
            if (err) {
                console.log(err);
            } else if (!row) {
                res.sendStatus(404)
            } else {
                console.log(user)
                let path = row.path
                fs.readFile(path, function(err, data) {
                    if (err) {
                        console.log(err)
                    } else {
                        res.set('Content-Type', 'image/gif')
                        res.send(data);
                    }
                    
                });
            }
        })
    }
}) 

app.post('/add_friend', (req, res) => {
    const user_one = req.body.user_one
    const user_two = req.body.user_two
    const sql = 'REPLACE INTO Friends (User_one, User_two, Status) VALUES (?, ?, ?)'

    db.run(sql, [user_one, user_two, 0], (err) => {
        if (err) {
            console.log(err)
        } else {
            res.sendStatus(200)
        }
    })
})

app.put('/remove_friend', (req, res) => {
    const user_one = req.body.user_one
    const user_two = req.body.user_two
    const sql = 'DELETE FROM Friends WHERE ((User_one = ? AND User_two = ?) OR (User_two = ? AND User_one = ?)) AND (Status = 0 OR Status = 1)'

    db.run(sql, [user_one, user_two, user_one, user_two], (err) => {
        if (err) {
            console.log(err)
        } else {
            res.sendStatus(200)
        }
    })
})

app.get('/relation', (req, res) => {
    const user_1 = req.query.user_1
    const user_2 = req.query.user_2
    const sql = `SELECT * FROM Friends WHERE ((User_one = ? AND User_two = ?) OR (User_two = ? AND User_one = ?))`

    db.get(sql, [user_1, user_2, user_1, user_2], (err, row) => {
        if (err) {
            console.log(err)
        } else {
            if (row) {
                res.send({
                    relation: row.Status,
                    user_1: row.User_one,
                    user_2: row.user_two,
                })
            } else {
                res.send({relation: 2})
            }
        }
    })
})

app.get('/search', (req, res) => {
    const search = req.query.search
    const curUser = req.query.user
    if (!search) {
        res.send([])
    } else {
        const sql =`SELECT Username FROM Users WHERE Username LIKE '${search}%' LIMIT 10`
        db.all(sql, (err, rows) => {
            if (err) {
                console.log(sql)
                console.log(err)
            } else {
                let arr = []
                rows.forEach(row => {
                    if (row.Username != curUser) {
                        arr.push(row.Username)
                    }
                })
                console.log(arr)
                res.send(arr)
            }
            
        })
    }

})

app.get('/requests', (req, res) => {
    const user = req.query.user
    const sql = 'SELECT User_one FROM Friends WHERE User_two = ? AND Status = 0'

    db.all(sql, [user], (err, rows) => {
        if (err) {
            console.log(err)
        } else {
            let arr = []
            rows.forEach(row => {
                arr.push(row.User_one)
            })
            console.log(arr)
            res.send(arr)
        }
    })
})

app.put('/accept', (req, res) => {
    const user_one = req.body.user_one
    const user_two = req.body.user_two
    const sql = 'UPDATE Friends SET Status = 1 WHERE User_one = ? AND User_two = ?'

    db.run(sql, [user_one, user_two], (err) => {
        if (err) {
            console.log(err)
        } else {
            res.sendStatus(200)
        }
    })
})

app.get("/api", (req, res) => {
    res.json({ message: "Hello from server!" });
  });

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});

