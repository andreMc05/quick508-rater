import type { Referee } from "../types.ts";
import { StubReferee } from "./stub.ts";
import { TypesafeReferee } from "./typesafe.ts";

export function createReferee(): Referee {
  const key = process.env.TYPESAFE_API_KEY?.trim();
  if (key) return new TypesafeReferee(key);
  return new StubReferee();
}

export { StubReferee, TypesafeReferee };
