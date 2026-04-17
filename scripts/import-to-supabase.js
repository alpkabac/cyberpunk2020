"use strict";
/**
 * Script to import extracted Foundry data into Supabase
 *
 * This script reads the JSON files created by extract-foundry-data.ts
 * and imports them into the corresponding Supabase tables.
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var path = require("path");
var supabase_js_1 = require("@supabase/supabase-js");
// Load environment variables
var dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, '../.env.local') });
var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing Supabase credentials in .env.local');
    console.error('Required: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}
var supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_SERVICE_KEY);
/**
 * Transform Foundry weapon data to our schema
 */
function transformWeapon(item) {
    var data = item.data;
    return {
        name: item.name,
        weapon_type: data.weaponType || 'Unknown',
        accuracy: parseInt(data.accuracy) || 0,
        concealability: data.concealability || '',
        availability: data.availability || '',
        ammo_type: data.ammoType || '',
        damage: data.damage || '1d6',
        ap: data.ap || false,
        shots: parseInt(data.shots) || 0,
        rof: parseInt(data.rof) || 1,
        reliability: data.reliability || 'ST',
        range: parseInt(data.range) || 0,
        attack_type: data.attackType || '',
        attack_skill: data.attackSkill || '',
        cost: parseInt(data.cost) || 0,
        weight: parseFloat(data.weight) || 0,
        flavor: data.flavor || '',
        notes: data.notes || '',
        source: data.source || item.data.source || 'Cyberpunk 2020'
    };
}
/**
 * Transform Foundry armor data to our schema
 */
function transformArmor(item) {
    var data = item.data;
    // Extract coverage data
    var coverage = data.coverage || {};
    return {
        name: item.name,
        coverage: coverage,
        encumbrance: parseInt(data.encumbrance) || 0,
        cost: parseInt(data.cost) || 0,
        weight: parseFloat(data.weight) || 0,
        flavor: data.flavor || '',
        notes: data.notes || '',
        source: data.source || 'Cyberpunk 2020'
    };
}
/**
 * Transform Foundry cyberware data to our schema
 */
function transformCyberware(item) {
    var data = item.data;
    return {
        name: item.name,
        surg_code: data.surgCode || '',
        humanity_cost: data.humanityCost || '',
        humanity_loss: parseFloat(data.humanityLoss) || 0,
        cyberware_type: data.cyberwareType || '',
        cost: parseInt(data.cost) || 0,
        weight: parseFloat(data.weight) || 0,
        flavor: data.flavor || '',
        notes: data.notes || '',
        source: data.source || 'Cyberpunk 2020'
    };
}
/**
 * Transform Foundry gear data to our schema
 */
function transformGear(item) {
    var data = item.data;
    return {
        name: item.name,
        cost: parseInt(data.cost) || 0,
        weight: parseFloat(data.weight) || 0,
        flavor: data.flavor || '',
        notes: data.notes || '',
        source: data.source || 'Cyberpunk 2020'
    };
}
/**
 * Transform Foundry vehicle data to our schema
 */
function transformVehicle(item) {
    var data = item.data;
    return {
        name: item.name,
        vehicle_type: data.vehicleType || '',
        top_speed: parseInt(data.topSpeed) || 0,
        acceleration: parseInt(data.acceleration) || 0,
        handling: parseInt(data.handling) || 0,
        armor: parseInt(data.armor) || 0,
        sdp: parseInt(data.sdp) || 0,
        cost: parseInt(data.cost) || 0,
        weight: parseFloat(data.weight) || 0,
        flavor: data.flavor || '',
        notes: data.notes || '',
        source: data.source || 'Cyberpunk 2020'
    };
}
/**
 * Transform Foundry skill data to our schema
 */
function transformSkill(item) {
    var data = item.data;
    return {
        name: item.name,
        linked_stat: data.linkedStat || data.stat || 'INT',
        category: data.category || '',
        description: data.flavor || data.description || '',
        source: data.source || 'Cyberpunk 2020'
    };
}
/**
 * Transform Foundry program data to our schema (matches `programs` in schema.sql)
 */
function transformProgram(item) {
    var _a, _b, _c;
    var data = item.data;
    var strengthRaw = (_a = data.strength) !== null && _a !== void 0 ? _a : data.power;
    var muRaw = (_c = (_b = data.muCost) !== null && _b !== void 0 ? _b : data.mu_cost) !== null && _c !== void 0 ? _c : data.mu;
    var options = [];
    if (Array.isArray(data.options)) {
        options = data.options.map(function (x) { return String(x); });
    }
    return {
        name: item.name,
        program_type: data.programType || '',
        program_class: data.programClass || data.program_class || '',
        strength: Math.round(Number(strengthRaw)) || 0,
        mu_cost: Math.round(Number(muRaw)) || 0,
        cost: parseInt(data.cost, 10) || 0,
        description: data.flavor || data.description || '',
        source: data.source || item.data.source || 'Cyberpunk 2020',
        options: options,
    };
}
/**
 * Import data for a specific category
 */
function importCategory(category, tableName, transformFn) {
    return __awaiter(this, void 0, void 0, function () {
        var dataPath, rawData, transformedData, validData, deleteError, BATCH_SIZE, imported, i, batch, insertError;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log("\nImporting ".concat(category, "..."));
                    dataPath = path.join(__dirname, '../lib/data', "".concat(category, ".json"));
                    if (!fs.existsSync(dataPath)) {
                        console.warn("  \u26A0 Data file not found: ".concat(category, ".json"));
                        return [2 /*return*/];
                    }
                    rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
                    console.log("  \uD83D\uDCC4 Loaded ".concat(rawData.length, " items from ").concat(category, ".json"));
                    transformedData = rawData.map(transformFn);
                    validData = transformedData.filter(function (item) {
                        if (!item.name || item.name.trim() === '') {
                            console.warn("  \u26A0 Skipping item with empty name");
                            return false;
                        }
                        return true;
                    });
                    console.log("  \u2713 Transformed ".concat(validData.length, " valid items"));
                    return [4 /*yield*/, supabase
                            .from(tableName)
                            .delete()
                            .neq('id', '00000000-0000-0000-0000-000000000000')];
                case 1:
                    deleteError = (_a.sent()).error;
                    if (deleteError) {
                        console.error("  \u274C Failed to clear existing data:", deleteError.message);
                        return [2 /*return*/];
                    }
                    console.log("  \uD83D\uDDD1\uFE0F  Cleared existing data from ".concat(tableName));
                    BATCH_SIZE = 100;
                    imported = 0;
                    i = 0;
                    _a.label = 2;
                case 2:
                    if (!(i < validData.length)) return [3 /*break*/, 5];
                    batch = validData.slice(i, i + BATCH_SIZE);
                    return [4 /*yield*/, supabase
                            .from(tableName)
                            .insert(batch)];
                case 3:
                    insertError = (_a.sent()).error;
                    if (insertError) {
                        console.error("  \u274C Failed to insert batch ".concat(i / BATCH_SIZE + 1, ":"), insertError.message);
                        console.error("  Details:", insertError);
                    }
                    else {
                        imported += batch.length;
                        console.log("  \u2713 Imported batch ".concat(i / BATCH_SIZE + 1, " (").concat(batch.length, " items)"));
                    }
                    _a.label = 4;
                case 4:
                    i += BATCH_SIZE;
                    return [3 /*break*/, 2];
                case 5:
                    console.log("  \u2705 Successfully imported ".concat(imported, "/").concat(validData.length, " items to ").concat(tableName));
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Main import function
 */
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var error, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('Supabase Data Import');
                    console.log('====================');
                    console.log("Supabase URL: ".concat(SUPABASE_URL));
                    console.log('');
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 10, , 11]);
                    return [4 /*yield*/, supabase.from('weapons').select('count').limit(1)];
                case 2:
                    error = (_a.sent()).error;
                    if (error) {
                        console.error('❌ Failed to connect to Supabase:', error.message);
                        console.error('Make sure the database schema is set up and credentials are correct.');
                        process.exit(1);
                    }
                    console.log('✓ Connected to Supabase successfully\n');
                    // Import each category
                    return [4 /*yield*/, importCategory('weapons', 'weapons', transformWeapon)];
                case 3:
                    // Import each category
                    _a.sent();
                    return [4 /*yield*/, importCategory('armor', 'armor', transformArmor)];
                case 4:
                    _a.sent();
                    return [4 /*yield*/, importCategory('cyberware', 'cyberware', transformCyberware)];
                case 5:
                    _a.sent();
                    return [4 /*yield*/, importCategory('gear', 'gear', transformGear)];
                case 6:
                    _a.sent();
                    return [4 /*yield*/, importCategory('vehicles', 'vehicles', transformVehicle)];
                case 7:
                    _a.sent();
                    return [4 /*yield*/, importCategory('skills', 'skills_reference', transformSkill)];
                case 8:
                    _a.sent();
                    return [4 /*yield*/, importCategory('programs', 'programs', transformProgram)];
                case 9:
                    _a.sent();
                    console.log('\n✅ Import complete!');
                    return [3 /*break*/, 11];
                case 10:
                    error_1 = _a.sent();
                    console.error('\n❌ Import failed:', error_1);
                    process.exit(1);
                    return [3 /*break*/, 11];
                case 11: return [2 /*return*/];
            }
        });
    });
}
// Run the script
main();
