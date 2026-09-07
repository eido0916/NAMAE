import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',use:{browserName:'chromium',channel:'chrome',headless:true},workers:1});
