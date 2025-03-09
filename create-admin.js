const sqlite3 = require('sqlite3').verbose(); // Добавьте это
const path = require('path'); // Добавьте это
const db = new sqlite3.Database(path.join(__dirname, '..', 'media.db')); // Замените эту строку
const auth = require('./server/auth');

async function createAdmin() {
    try {
        const existingUser = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM users WHERE username = ?', ['admin'], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });

        if (existingUser) {
            console.log('Админ уже существует!');
            console.log('Для обновления пароля выполните:');
            console.log('UPDATE users SET password = "$2b$10$Cl9GLs4.81Sd1Ww/gsq.ze6r2uWW9X9RnPX3HMm6MKzLf.kMmj16C" WHERE username = "admin";');
            return;
        }

        await auth.register('admin', 'admin123', 'admin');
        console.log('Админ успешно создан!');
    } catch (error) {
        console.error('Ошибка:', error.message);
    } finally {
        db.close();
    }
}

createAdmin();