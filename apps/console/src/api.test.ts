import assert from "node:assert/strict";
import test from "node:test";
import {normalizeApiError} from "./api";
test("API errors preserve structured validation metadata",()=>{const error=normalizeApiError(400,{error:"Review fields",code:"VALIDATION_ERROR",fieldErrors:{email:"Invalid"},requestId:"req_123"});assert.equal(error.status,400);assert.equal(error.fieldErrors?.email,"Invalid");assert.equal(error.requestId,"req_123");});
test("API errors normalize conflict, rate limit, server, and malformed responses",()=>{assert.match(normalizeApiError(409,{}).message,/account already exists/i);assert.match(normalizeApiError(429,{}).message,/too many attempts/i);assert.doesNotMatch(normalizeApiError(500,{error:"database stack trace"}).message,/database/i);assert.match(normalizeApiError(500,null).message,/couldn’t complete/i);});
