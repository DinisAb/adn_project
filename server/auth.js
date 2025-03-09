const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const auth = {
    async register(username, password, role = 'user') {
        try {
            // Генерируем соль для хэширования
            const salt = await bcrypt.genSalt(10);
            const hash = await bcrypt.hash(password, salt);

            // Добавляем пользователя в базу
            return new Promise((resolve, reject) => {
                db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                    [username, hash, role], function(err) {
                        if (err) return reject(err);
                        resolve(this.lastID);
                    });
            });
        } catch (error) {
            throw new Error('Ошибка регистрации: ' + error.message);
        }
    },

    async login(username, password) {
        try {
            // Получаем пользователя из базы
            const user = await new Promise((resolve, reject) => {
                db.get('SELECT * FROM users WHERE username = ?', [username], (err, row) => {
                    if (err) return reject(err);
                    resolve(row);
                });
            });

            // Проверяем существование пользователя
            if (!user) {
                throw new Error('Пользователь не найден');
            }

            // Проверяем пароль
            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                throw new Error('Неверный пароль');
            }

            // Проверяем роль администратора
            if (user.role !== 'admin') {
                throw new Error('Требуются права администратора');
            }

            // Генерируем JWT-токен
            const token = jwt.sign(
                { id: user.id, role: user.role },
                process.env.SECRET,
                { expiresIn: '1d' }
            );

            return token;
        } catch (error) {
            throw new Error('Ошибка входа: ' + error.message);
        }
    }
};

module.exports = auth;