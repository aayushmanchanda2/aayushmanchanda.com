/** `data/tokens.json`, typed. JSON imports infer `number[]`, never the `Row` tuple the file holds. */
import raw from "../data/tokens.json";
import type { TokenData } from "./tokens";

export const tokens = raw as unknown as TokenData;
