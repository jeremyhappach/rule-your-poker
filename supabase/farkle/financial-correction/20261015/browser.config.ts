import {defineConfig} from '@playwright/test';
import path from 'node:path';
const run=process.env.FARKLE_PROOF_RUN??'handoff-v2';
export default defineConfig({testDir:'.',testMatch:'browser.spec.ts',workers:1,retries:0,maxFailures:1,timeout:240000,expect:{timeout:20000},reporter:[['line'],['json',{outputFile:path.resolve(`qualification.local/farkle-full-stack/${run}-results.json`)}]],outputDir:`../../../../qualification.local/farkle-full-stack/${run}-output`,use:{baseURL:'http://127.0.0.1:5177',channel:'msedge',actionTimeout:20000,screenshot:'only-on-failure',trace:'on'}});
