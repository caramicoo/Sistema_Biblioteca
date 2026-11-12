'use strict';
const mysql = require('mysql2/promise');
const { database } = require('./config');
const pool = mysql.createPool(database);
async function transaction(work) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
module.exports = { pool, transaction };
