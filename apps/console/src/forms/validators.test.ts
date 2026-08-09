import assert from "node:assert/strict";
import test from "node:test";
import {validateLogin,validateOtp,validateReset,validateSignup,type SignupValues} from "./validators";
const valid:SignupValues={firstName:"Alaa",lastName:"Hasan",email:"alaa@example.com",phone:"+15551234567",legalName:"Example Limited",tradingName:"",registrationCountry:"US",operatingCountry:"NG",password:"Strong-Password-123",confirmPassword:"Strong-Password-123",acceptedTerms:true};
test("business signup identifies every missing or invalid required value",()=>{const errors=validateSignup({...valid,firstName:"",lastName:"",email:"invalid",phone:"555",legalName:"",registrationCountry:"",operatingCountry:"XX",password:"weak",confirmPassword:"different",acceptedTerms:false});assert.deepEqual(Object.keys(errors),["firstName","lastName","email","phone","legalName","registrationCountry","operatingCountry","password","confirmPassword","acceptedTerms"]);});
test("valid signup preserves canonical country codes",()=>assert.deepEqual(validateSignup(valid),{}));
test("login and OTP return field-specific issues",()=>{assert.ok(validateLogin({email:"bad",password:""}).email);assert.ok(validateLogin({email:"bad",password:""}).password);assert.ok(validateOtp("123").code);assert.deepEqual(validateOtp("123456"),{});});
test("password reset validates policy and confirmation",()=>{const errors=validateReset({code:"123",password:"weak",confirmPassword:"other"});assert.ok(errors.code);assert.ok(errors.password);assert.ok(errors.confirmPassword);});
