const db = require('./database/db');

async function addDenominationsToVaultUpdate() {
  try {
    console.log('Adding denomination columns to vault_update table...');
    const denominationColumns = [
      'ones INT DEFAULT 0',
      'fives INT DEFAULT 0',
      'tens INT DEFAULT 0',
      'twenties INT DEFAULT 0',
      'forties INT DEFAULT 0',
      'fifties INT DEFAULT 0',
      'hundreds INT DEFAULT 0',
      'twoHundreds INT DEFAULT 0',
      'fiveHundreds INT DEFAULT 0',
      'thousands INT DEFAULT 0'
    ];
    for (const column of denominationColumns) {
      const [columnName] = column.split(' ');
      try {
        await db.query(`ALTER TABLE vault_update ADD COLUMN ${column}`);
        console.log(`✅ Added column: ${columnName}`);
      } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
          console.log(`Column ${columnName} already exists`);
        } else {
          console.error(`Error adding column ${columnName}:`, error.message);
        }
      }
    }
    const [columns] = await db.query('DESCRIBE vault_update');
    console.log('\nUpdated vault_update table structure:');
    columns.forEach(col => {
      console.log(`${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });
    console.log('\n✅ Denomination columns added to vault_update table successfully');
  } catch (error) {
    console.error('Error adding denomination columns to vault_update table:', error);
  } finally {
    process.exit(0);
  }
}

addDenominationsToVaultUpdate(); 