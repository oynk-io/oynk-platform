import assert from "node:assert/strict";
import test from "node:test";
import {countries,hasCountry,searchCountries} from "./countries";
test("required operating countries are present with canonical codes",()=>{for(const code of ["US","NG","KW","GB","CA","GH","KE","ZA","AE","FR","DE"])assert.equal(hasCountry(code),true);assert.equal(new Set(countries.map((country)=>country.code)).size,countries.length);});
test("country search supports names, codes, and common aliases",()=>{assert.equal(searchCountries("Nigeria")[0]?.code,"NG");assert.equal(searchCountries("KW")[0]?.code,"KW");assert.ok(searchCountries("UK").some((country)=>country.code==="GB"));});
