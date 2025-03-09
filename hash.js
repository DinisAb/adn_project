const bcrypt = require('bcrypt');
const saltRounds = 10;

const passwords = ['admin123', 'user123', 'user456'];
passwords.forEach(password => {
    bcrypt.hash(password, saltRounds, (err, hash) => {
        if (err) console.error(err);
        console.log(`Password: ${password}, Hash: ${hash}`);
    });
});