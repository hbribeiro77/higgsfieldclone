import assert from "node:assert/strict";
import test from "node:test";
import {
  passwordMatchesStudioAccessSecret,
  studioAccessCookieIsValid,
  studioAccessCookieValue,
} from "./verificacao-da-senha-de-acesso-do-estudio.ts";

const secret = "senha-da-vps";

test("a senha certa libera e a errada não", () => {
  assert.equal(passwordMatchesStudioAccessSecret(secret, secret), true);
  assert.equal(passwordMatchesStudioAccessSecret("outra", secret), false);
  assert.equal(passwordMatchesStudioAccessSecret("", secret), false);
  assert.equal(passwordMatchesStudioAccessSecret(secret, ""), false);
});

test("o cookie só vale para a senha que o gerou", () => {
  const cookie = studioAccessCookieValue(secret);
  assert.equal(studioAccessCookieIsValid(cookie, secret), true);
  assert.equal(studioAccessCookieIsValid(cookie, "outra-senha"), false);
  assert.equal(studioAccessCookieIsValid("curto", secret), false);
  assert.equal(studioAccessCookieIsValid(undefined, secret), false);
});
