const mysql = require('mysql2/promise');
require('dotenv').config();

const addTransactionDateToClientUpdate = async () => {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bm_admin_db'
  });

  try {
    console.log('Adding transaction_date column to client_update table...');

    // Add transaction_date column
    await connection.execute(`
      ALTER TABLE client_update 
      ADD COLUMN transaction_date DATE AFTER created_at
    `);

    console.log('✅ Successfully added transaction_date column to client_update table');

    // Update existing records to set transaction_date = created_at
    await connection.execute(`
      UPDATE client_update 
      SET transaction_date = DATE(created_at) 
      WHERE transaction_date IS NULL
    `);

    console.log('✅ Updated existing records with transaction_date');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await connection.end();
  }
};

addTransactionDateToClientUpdate(); 