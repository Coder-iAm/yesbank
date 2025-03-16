const express = require("express");
const fs = require("fs");
const app = express();
const path = require('path');
const session = require("express-session");
require("dotenv").config();
const mysql = require('mysql2');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
const port=3000;

const uploadDir = path.join(__dirname, 'img');
app.use('/img', express.static(uploadDir));

app.use(session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

const caCert = fs.readFileSync(path.join(__dirname, process.env.DB_SSL_CA));

const connection = mysql.createConnection({
    host: process.env.DB_HOST, // Your Aiven MySQL host from .env
    port: process.env.DB_PORT, // The port provided by Aiven from .env
    user: process.env.DB_USER, // Your Aiven user from .env
    password: process.env.DB_PASSWORD, // Your Aiven password from .env
    database: process.env.DB_NAME, // Your Aiven database name from .env
    ssl: {
        ca: caCert
    }
});

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to the database: ', err);
    } else {
        console.log('Connected to the database.');
    }
});

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/home.html");

})
app.get("/style.css", (req, res) => {
    res.sendFile(__dirname + "/style.css");
})


app.post("/admin-login", (req, res) => {

    const username = req.body.username;
    const password = req.body.password;
    if(username!="admin123" && password!="admin@pass"){
      return  res.json({err:"warning"});
    }
    const query = 'SELECT * FROM BankUser WHERE username = ? AND password = ?';
    connection.query(query, [username, password], (err, results) => {
        if (err || results.length === 0) {
            res.json({err:"invalid"});
        }
      else {
            req.session.user = results[0].username; 
            res.json({success:"done"});
        }
    });

})

app.get("/dashboard", (req, res) => {
    if(req.session.user){
    res.sendFile(__dirname + "/dashboard.html");
    }
    else{
        res.redirect("/");
    }
})





app.post("/create-account", (req, res) => {
    const { name, username, password, account_number, aadhaar, email, branch, ifsc } = req.body;

    // Validation: Check if all fields are provided
    if (!name || !username || !password || !account_number || !aadhaar || !email || !branch || !ifsc) {
        return res.json({ error: "missing" });
    }

    // Check if the user already exists
    const query = 'SELECT * FROM BankUser WHERE username = ? OR email = ?';
    connection.query(query, [username, email], (err, results) => {
        if (err) {
            console.error("Database Error:", err);
            return res.json({ error: "db_error" });
        }

        if (results.length > 0) {
            return res.json({ error: "exist" }); // Username or Email already exists
        } else {
            // Generate a random UPI ID and initial balance (assuming ₹0.00 as default)
            const upi_id = username + "@yesbank";
            const balance = 0.00;

            // Insert the new user into BankUser table
            const insertQuery = `INSERT INTO BankUser 
                (name, username, password, account_number, email, branch, ifsc, upi_id, balance, adhaar_number) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            connection.query(insertQuery, [name, username, password, account_number, email, branch, ifsc, upi_id, balance, aadhaar], (insertErr, insertResults) => {
                if (insertErr) {
                    console.error("Insert Error:", insertErr);
                    return res.json({ error: "insert_failed" });
                }

                return res.json({ success: "account_created" });
            });
        }
    });
});



app.get("/user-list",(req,res)=>{

      if(req.session.user){
        
        connection.query("SELECT * FROM BankUser", (err, results) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ success: false, message: "Database error" });
            }
            res.json({ success: true, users: results });
        });
    } else {
        res.status(403).json({ success: false, message: "Unauthorized" });
    }

})


// Delete User API
app.post('/delete-user', (req, res) => {
    const { username } = req.body;

    connection.query('DELETE FROM BankUser WHERE username = ?', [username], (err, result) => {
        if (err) {
            console.error(err);
            return res.json({ success: false, message: 'Database error' });
        }
        if (result.affectedRows > 0) {
            return res.json({ success: true });
        } else {
            return res.json({ success: false, message: 'User not found' });
        }
    });
});

app.post("/addFunds", (req, res) => {
    const { receiverAccount, amount, date } = req.body;
    const sender = req.session.user;

    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
        return res.json({ success: false, message: "Invalid amount" });
    }

    // Fetch sender balance
    connection.query("SELECT balance FROM BankUser WHERE username = ?", [sender], (err, senderResult) => {
        if (err) return res.json({ success: false, message: "Error fetching sender balance" });
        if (senderResult.length === 0) return res.json({ success: false, message: "Sender not found" });

        let senderBalance = Number(senderResult[0].balance || 0);
        if (senderBalance < amountNum) {
            return res.json({ success: false, message: "Insufficient funds" });
        }

        let newSenderBalance = senderBalance - amountNum;
        let senderTransactionText = `${amountNum} debited from your account to ${receiverAccount} on ${date}`;

        // Update sender balance and transactions using JSON_ARRAY_APPEND
        connection.query(
            "UPDATE BankUser SET balance = ?, transactions = JSON_ARRAY_APPEND(transactions, '$', ?) WHERE username = ?",
            [newSenderBalance, senderTransactionText, sender],
            (err) => {
                if (err) return res.json({ success: false, message: "Error updating sender balance" });

                // Fetch receiver details
                connection.query("SELECT username, balance FROM BankUser WHERE account_number = ?", 
                    [receiverAccount], (err, receiverResult) => {
                        if (err) return res.json({ success: false, message: "Error fetching receiver details" });
                        if (receiverResult.length === 0) return res.json({ success: false, message: "Receiver account not found" });

                        const receiver = receiverResult[0].username;
                        let receiverBalance = Number(receiverResult[0].balance || 0);
                        let newReceiverBalance = receiverBalance + amountNum;
                        let receiverTransactionText = `${amountNum} credited to your account by ${sender} on ${date}`;

                        // Update receiver balance and transactions using JSON_ARRAY_APPEND
                        connection.query(
                            "UPDATE BankUser SET balance = ?, transactions = JSON_ARRAY_APPEND(transactions, '$', ?) WHERE username = ?",
                            [newReceiverBalance, receiverTransactionText, receiver],
                            (err) => {
                                if (err) return res.json({ success: false, message: "Error updating receiver balance" });

                                res.json({ success: true, message: `Transaction successful! Sent ₹${amountNum} to ${receiver}` });
                            }
                        );
                    }
                );
            }
        );
    });
});



app.post("/withdrawFunds", (req, res) => {
    const { userAccount, amount, date } = req.body;

    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
        return res.json({ success: false, message: "Invalid amount" });
    }

    // Check if the account exists
    connection.query("SELECT balance FROM BankUser WHERE account_number = ?", 
        [userAccount], (err, result) => {
        if (err) return res.json({ success: false, message: "Error fetching account details" });
        if (result.length === 0) return res.json({ success: false, message: "Account not found" });

        let userBalance = Number(result[0].balance || 0);
        if (userBalance < amountNum) {
            return res.json({ success: false, message: "Insufficient funds" });
        }

        let newUserBalance = userBalance - amountNum;
        let transactionText = `₹${amountNum} withdrawn from your account on ${date}`;

        // Update balance and transactions using JSON_ARRAY_APPEND
        connection.query(
            "UPDATE BankUser SET balance = ?, transactions = JSON_ARRAY_APPEND(transactions, '$', ?) WHERE account_number = ?",
            [newUserBalance, transactionText, userAccount],
            (err) => {
                if (err) return res.json({ success: false, message: "Error updating balance" });

                res.json({ success: true, message: `Withdrawal successful! ₹${amountNum} withdrawn.` });
            }
        );
    });
});


app.post("/transferFunds", (req, res) => {
    const { senderAccount, receiverAccount, amount, date, time } = req.body;

    const amountNum = Number(amount);
    if (!senderAccount || !receiverAccount || isNaN(amountNum) || amountNum <= 0) {
        return res.json({ success: false, message: "Invalid input data" });
    }

    // Fetch sender balance
    connection.query("SELECT username, balance FROM BankUser WHERE account_number = ?", [senderAccount], (err, senderResult) => {
        if (err) return res.json({ success: false, message: "Error fetching sender details" });
        if (senderResult.length === 0) return res.json({ success: false, message: "Sender account not found" });

        let sender = senderResult[0].username;
        let senderBalance = Number(senderResult[0].balance || 0);
        
        if (senderBalance < amountNum) {
            return res.json({ success: false, message: "Insufficient funds" });
        }

        let newSenderBalance = senderBalance - amountNum;
        let senderTransactionText = `${amountNum} debited from your account to ${receiverAccount} on ${date} at ${time}`;

        // Fetch receiver details
        connection.query("SELECT username, balance FROM BankUser WHERE account_number = ?", [receiverAccount], (err, receiverResult) => {
            if (err) return res.json({ success: false, message: "Error fetching receiver details" });
            if (receiverResult.length === 0) return res.json({ success: false, message: "Receiver account not found" });

            let receiver = receiverResult[0].username;
            let receiverBalance = Number(receiverResult[0].balance || 0);
            let newReceiverBalance = receiverBalance + amountNum;
            let receiverTransactionText = `${amountNum} credited to your account by ${sender} on ${date} at ${time}`;

            // Begin transaction
            connection.beginTransaction((err) => {
                if (err) return res.json({ success: false, message: "Transaction error" });

                // Update sender balance and transactions
                connection.query(
                    "UPDATE BankUser SET balance = ?, transactions = JSON_ARRAY_APPEND(transactions, '$', ?) WHERE account_number = ?",
                    [newSenderBalance, senderTransactionText, senderAccount],
                    (err) => {
                        if (err) {
                            return connection.rollback(() => {
                                res.json({ success: false, message: "Error updating sender balance" });
                            });
                        }

                        // Update receiver balance and transactions
                        connection.query(
                            "UPDATE BankUser SET balance = ?, transactions = JSON_ARRAY_APPEND(transactions, '$', ?) WHERE account_number = ?",
                            [newReceiverBalance, receiverTransactionText, receiverAccount],
                            (err) => {
                                if (err) {
                                    return connection.rollback(() => {
                                        res.json({ success: false, message: "Error updating receiver balance" });
                                    });
                                }

                                // Commit transaction
                                connection.commit((err) => {
                                    if (err) {
                                        return connection.rollback(() => {
                                            res.json({ success: false, message: "Transaction commit failed" });
                                        });
                                    }
                                    res.json({ success: true, message: `Transaction successful! ₹${amountNum} sent to ${receiver}` });
                                });
                            }
                        );
                    }
                );
            });
        });
    });
});



app.get("/transactions-data", (req, res) => {
    const user = req.session.user;

    if (!user) {
        return res.json({ message: "no" }); // Handle unauthorized access
    }

    connection.query(
        "SELECT JSON_UNQUOTE(JSON_EXTRACT(transactions, '$')) AS transactions FROM BankUser WHERE username = ?",
        [user],
        (err, results) => {
            if (err) {
                console.error("Database error:", err);
                return res.status(500).json({ message: "error" });
            }

            if (results.length === 0 || !results[0].transactions) {
                return res.json({ message: "no" });
            }

            try {
                const transactions = JSON.parse(results[0].transactions);
                res.json({ transactions });
            } catch (error) {
                console.error("JSON parsing error:", error);
                res.status(500).json({ message: "error" });
            }
        }
    );
});




app.post("/delete-transactions", (req, res) => {
    const user = req.session.user;

    if (!user) {
        return res.json({ success: false, message: "User not authenticated" });
    }

    connection.query(
        "UPDATE BankUser SET transactions = JSON_ARRAY() WHERE username = ?",
        [user],
        (err, result) => {
            if (err) {
                console.error("Database error:", err);
                return res.status(500).json({ success: false, message: "Error deleting transactions" });
            }

            res.json({ success: true, message: "All transactions deleted" });
        }
    );
});




// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});