require('dotenv').config();
const mongoose = require('mongoose');
const { rebuildUserContext } = require('./contextManager');
const User = require('../../models/User');

const migrateAllData = async () => {
    console.log('🚀 Starting RAG Migration...');

    try {
        // 1. Connect to MongoDB (PG connection is handled inside pgClient via contextManager)
        if (!process.env.MONGODB_URI) {
            console.error('❌ MONGODB_URI missing in .env');
            process.exit(1);
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // 2. Fetch all users
        const users = await User.find({});
        console.log(`📂 Found ${users.length} users to migrate.`);

        // 3. Rebuild context for each user
        let successCount = 0;
        let totalChunks = 0;

        for (const user of users) {
            const userId = user._id.toString();
            console.log(`⏳ Vectorizing data for user: ${userId} (${user.name || 'No Name'})...`);

            try {
                const result = await rebuildUserContext(userId);
                if (!result.error) {
                    successCount++;
                    totalChunks += result.chunksStored;
                    console.log(`   ✅ Success: ${result.chunksStored} chunks vectorized`);
                } else {
                    console.error(`   ❌ Failed for ${userId}: ${result.error}`);
                }
            } catch (userErr) {
                console.error(`   ❌ Unexpected error for ${userId}:`, userErr.message);
            }
        }

        console.log('\n--- Migration Summary ---');
        console.log(`✅ Users successfully migrated: ${successCount}/${users.length}`);
        console.log(`🧠 Total knowledge chunks stored: ${totalChunks}`);
        console.log('🚀 Migration complete!');

    } catch (err) {
        console.error('❌ Migration Critical Error:', err);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
};

migrateAllData();
