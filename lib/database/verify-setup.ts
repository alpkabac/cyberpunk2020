/**
 * Database Setup Verification Script
 * 
 * Run this script to verify that your Supabase database is properly configured.
 * Usage: npx tsx app/lib/database/verify-setup.ts
 */

import { supabase } from '../supabase';

async function verifyDatabaseSetup() {
  console.log('🔍 Verifying Supabase database setup...\n');

  const checks = {
    connection: false,
    sessions: false,
    characters: false,
    tokens: false,
    chatMessages: false,
    weapons: false,
    armor: false,
    cyberware: false,
    gear: false,
    vehicles: false,
    skills: false,
    programs: false,
  };

  try {
    // Test connection
    console.log('1. Testing database connection...');
    const { error: connectionError } = await supabase.from('sessions').select('count').limit(0);
    if (connectionError) {
      console.error('   ❌ Connection failed:', connectionError.message);
      return;
    }
    checks.connection = true;
    console.log('   ✅ Connection successful\n');

    // Test each table
    const tables = [
      'sessions',
      'characters',
      'tokens',
      'chat_messages',
      'weapons',
      'armor',
      'cyberware',
      'gear',
      'vehicles',
      'skills_reference',
      'programs',
    ];

    console.log('2. Checking tables...');
    for (const table of tables) {
      const { error } = await supabase.from(table).select('count').limit(0);
      const key = table === 'chat_messages' ? 'chatMessages' : table === 'skills_reference' ? 'skills' : table;
      if (error) {
        console.log(`   ❌ Table '${table}' not found or not accessible`);
        console.error(`      Error: ${error.message}`);
      } else {
        checks[key as keyof typeof checks] = true;
        console.log(`   ✅ Table '${table}' exists`);
      }
    }

    console.log('\n3. Summary:');
    const allPassed = Object.values(checks).every(v => v);
    if (allPassed) {
      console.log('   🎉 All checks passed! Database is properly configured.');
    } else {
      console.log('   ⚠️  Some checks failed. Please review the errors above.');
      console.log('\n   Make sure you have run:');
      console.log('   1. schema.sql in your Supabase SQL Editor');
      console.log('   2. rls-policies.sql in your Supabase SQL Editor');
    }

  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

// Run verification
verifyDatabaseSetup();
