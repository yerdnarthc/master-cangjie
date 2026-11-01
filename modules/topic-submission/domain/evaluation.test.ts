import { describe, expect, it } from "vitest";
import { passes } from "./evaluation";

describe("passing threshold", () => {
  it("passes exactly three fifths without rounding", () => {
    expect(passes({ earned: 90, possible: 150 })).toBe(true);
    expect(passes({ earned: 80, possible: 150 })).toBe(false);
    expect(passes({ earned: 10, possible: 10 })).toBe(true);
    expect(passes({ earned: 0, possible: 10 })).toBe(false);
  });
});

import { evaluate, isEligibleBatch, participationAfter, sameBytes, assertSupportedRequirements } from "./evaluation";
import type { EvaluationContext, EvaluationRecord } from "./evaluation";

const context: EvaluationContext = {
  learnerId: "learner-a", problemId: "hello", source: "main() {}", languageVersion: "1.0.5",
  assessment: { topicId: "onboarding", revision: 1 }, caseIds: ["one", "two"],
};
const complete = evaluate("batch", context.caseIds, {
  kind: "executed", cases: [{ caseId: "one", outcome: "pass" }, { caseId: "two", outcome: "pass" }],
});
const record: EvaluationRecord = { context, kind: "batch", decision: complete };

describe("exact byte equality", () => {
  const expected = new TextEncoder().encode("Hello, World!\n");
  it("accepts exactly equal bytes", () => expect(sameBytes(expected, expected.slice())).toBe(true));
  it.each(["Hello, World!", "Hello, World!\n\n", "Hello, World!\r\n", "Hello, World! \n", "Hello, World!\t\n"])("rejects formatting change %j", actual => {
    expect(sameBytes(new TextEncoder().encode(actual), expected)).toBe(false);
  });
  it("does not equate distinct invalid UTF-8 sequences through display decoding", () => {
    expect(sameBytes(new Uint8Array([0xff]), new Uint8Array([0xfe]))).toBe(false);
  });
});

describe("score validation", () => {
  it.each([{earned:0,possible:0}, {earned:-10,possible:10}, {earned:20,possible:10}, {earned:5,possible:10}, {earned:10,possible:15}, {earned:NaN,possible:10}, {earned:0,possible:Infinity}, {earned:0,possible:Number.MAX_SAFE_INTEGER+1}])("rejects invalid score %j", score => expect(() => passes(score)).toThrow());
});

describe("evaluation decisions", () => {
  it("gives single runs feedback only, even when every selected case passes", () => {
    expect(evaluate("single", ["one"], {kind:"executed",cases:[{caseId:"one",outcome:"pass"}]})).toEqual({kind:"confirmed",solved:false});
  });
  it("returns all-tests-passed batch points and solved eligibility without topic completion", () => {
    expect(complete).toEqual({kind:"confirmed",score:{earned:20,possible:20},solved:true});
  });
  it("gives hidden and visible cases the same ten points", () => {
    expect(evaluate("batch", ["visible","hidden"], {kind:"executed",cases:[{caseId:"visible",outcome:"pass"},{caseId:"hidden",outcome:"fail"}]})).toEqual({kind:"confirmed",score:{earned:10,possible:20},solved:false});
  });
  it("confirmed compilation rejection gives a batch zero but no individual-run score", () => {
    expect(evaluate("batch",["one","two"],{kind:"compile-failure"})).toEqual({kind:"confirmed",score:{earned:0,possible:20},solved:false});
    expect(evaluate("single",["one"],{kind:"compile-failure"})).toEqual({kind:"confirmed",solved:false});
  });
  it.each(["fail","runtime-error","timeout","output-limit"] as const)("fails only the affected case for %s", outcome => {
    expect(evaluate("batch",["one","two"],{kind:"executed",cases:[{caseId:"one",outcome},{caseId:"two",outcome:"pass"}]})).toEqual({kind:"confirmed",score:{earned:10,possible:20},solved:false});
  });
  it("does not fabricate zero when service evidence is missing", () => {
    expect(evaluate("batch",["one"],{kind:"operational-failure"})).toEqual({kind:"incomplete"});
    expect(evaluate("batch",["one","two"],{kind:"executed",cases:[{caseId:"one",outcome:"pass"}]})).toEqual({kind:"incomplete"});
    expect(evaluate("batch",["one"],{kind:"executed",cases:[{caseId:"one",outcome:"unknown"}]})).toEqual({kind:"incomplete"});
  });
  it("rejects empty, duplicate, extra or invalid single-run scopes", () => {
    expect(() => evaluate("batch",[],{kind:"compile-failure"})).toThrow();
    expect(() => evaluate("batch",["one","one"],{kind:"compile-failure"})).toThrow();
    expect(() => evaluate("single",["one","two"],{kind:"compile-failure"})).toThrow();
    expect(() => evaluate("batch",["one"],{kind:"executed",cases:[{caseId:"other",outcome:"pass"}]})).toThrow();
    expect(() => evaluate("batch",["one"],{kind:"executed",cases:[{caseId:"one",outcome:"pass"},{caseId:"one",outcome:"pass"}]})).toThrow();
  });
});

describe("result eligibility", () => {
  it("allows reuse of a matching complete batch despite case ordering", () => {
    expect(isEligibleBatch(record,{...context,caseIds:["two","one"]})).toBe(true);
  });
  it("rejects a different learner, problem, exact source, language or assessment", () => {
    for (const changed of [{...context,learnerId:"other"},{...context,problemId:"other"},{...context,source:"main() {}\n"},{...context,languageVersion:"other"},{...context,assessment:{topicId:"other",revision:1}},{...context,assessment:{...context.assessment,revision:2}},{...context,caseIds:["one"]}]) {
      expect(isEligibleBatch(record,changed)).toBe(false);
    }
  });
  it("rejects a result scored against a different case denominator", () => {
    expect(isEligibleBatch({...record,decision:{kind:"confirmed",score:{earned:10,possible:10},solved:true}},context)).toBe(false);
  });
  it("rejects individual and incomplete results as batch scores", () => {
    expect(isEligibleBatch({...record,kind:"single"},context)).toBe(false);
    expect(isEligibleBatch({...record,decision:{kind:"incomplete"}},context)).toBe(false);
  });
});

describe("participation and structural scope", () => {
  it("viewing a correct starter alone is unattempted", () => expect(participationAfter(false,"view")).toBe(false));
  it.each(["edit","single","batch"] as const)("%s marks work attempted", event => expect(participationAfter(false,event)).toBe(true));
  it("never erases attempted history on revisit/revert", () => expect(participationAfter(true,"view")).toBe(true));
  it("supports no requirements and rejects unsupported structural rules", () => {
    expect(() => assertSupportedRequirements([])).not.toThrow();
    expect(() => assertSupportedRequirements([{kind:"required-function"}])).toThrow();
  });
});
