import type { Question, Referee, RefereeResult, State } from "../types.ts";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";

/**
 * Live Jev client. Domain rules stay in instructions/criteria/state.
 * Jev is not the decision maker — the engine thresholds these answers.
 */
export class TypesafeReferee implements Referee {
  name = "typesafe" as const;
  model: string;
  private key: string;

  constructor(apiKey: string, model = process.env.TYPESAFE_MODEL || "jev-latest") {
    this.key = apiKey;
    this.model = model;
  }

  async interpret(state: State, questions: Record<string, Question>): Promise<RefereeResult> {
    const body = {
      model: this.model,
      state,
      questions,
    };
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`TypeSafe System One HTTP ${res.status}: ${text.slice(0, 400)}`);
    }
    const json = (await res.json()) as RefereeResult;
    return json;
  }
}
