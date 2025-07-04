const db = require('./database/db');

async function addDenominationsToVault() {
  try {
    console.log('Adding denomination columns to vault table...');
    
    // Add denomination columns to vault table
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
        await db.query(`ALTER TABLE vault ADD COLUMN ${column} AFTER current_balance`);
        console.log(`✅ Added column: ${columnName}`);
      } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
          console.log(`Column ${columnName} already exists`);
        } else {
          console.error(`Error adding column ${columnName}:`, error.message);
        }
      }
    }

    // Verify the updated table structure
    const [vaultColumns] = await db.query('DESCRIBE vault');
    console.log('\nUpdated vault table structure:');
    vaultColumns.forEach(col => {
      console.log(`${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'}`);
    });

    console.log('\n✅ Denomination columns added to vault table successfully');
    
  } catch (error) {
    console.error('Error adding denomination columns to vault table:', error);
  } finally {
    process.exit(0);
  }
}

addDenominationsToVault(); 