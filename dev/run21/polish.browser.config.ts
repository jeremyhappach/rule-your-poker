import {defineConfig} from '@playwright/test';
import path from 'node:path';
const run=process.env.RUN21_PROOF_RUN??'run21-polish';
export default defineConfig({testDir:'.',testMatch:'polish.browser.spec.ts',workers:1,retries:0,maxFailures:1,timeout:240000,expect:{timeout:20000},reporter:[['line'],['json',{outputFile:path.resolve(`qualification.local/farkle-full-stack/${run}-results.json`)}]],outputDir:`../../qualification.local/farkle-full-stack/${run}-output`,use:{baseURL:'http://127.0.0.1:5178',channel:'msedge',actionTimeout:20000,screenshot:'only-on-failure',trace:'on'}});
