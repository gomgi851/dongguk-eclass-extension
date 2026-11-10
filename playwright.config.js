import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/browser',timeout:120000,globalTimeout:300000,workers:1,retries:0,reporter:[['list'],['html',{open:'never'}]],use:{trace:'retain-on-failure'}});
