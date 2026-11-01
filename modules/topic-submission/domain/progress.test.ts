import { describe, expect, it } from "vitest";
import { betterScore, retainCodingProgress } from "./progress";

const empty = {bestScore:null,completed:false,nextTopicAvailable:false,solved:false};

describe("best finalized percentage", () => {
  it("compares fractions rather than raw points", () => {
    expect(betterScore({earned:90,possible:150},{earned:80,possible:100})).toBe(false);
    expect(betterScore({earned:80,possible:100},{earned:90,possible:150})).toBe(true);
  });
  it("keeps earlier qualifying evidence for equal percentages", () => expect(betterScore({earned:20,possible:20},{earned:10,possible:10})).toBe(false));
  it("rejects impossible scores", () => expect(() => betterScore({earned:20,possible:10},{earned:0,possible:10})).toThrow());
});

describe("retained coding progress", () => {
  it("records failing finalized evidence without completing/unlocking", () => {
    expect(retainCodingProgress(empty,{earned:0,possible:10})).toEqual({...empty,bestScore:{earned:0,possible:10}});
  });
  it("completes and unlocks only on a passing finalized submission", () => {
    expect(retainCodingProgress(empty,{earned:10,possible:10},true)).toEqual({bestScore:{earned:10,possible:10},completed:true,nextTopicAvailable:true,solved:true});
  });
  it("passing batch may establish solved but does not complete the topic", () => {
    expect(retainCodingProgress(empty,null,true)).toEqual({...empty,solved:true});
  });
  it("does not change scores/progression for unknown or unfinalized work", () => expect(retainCodingProgress(empty,null)).toEqual(empty));
  it("retains best score, solved achievement and unlock after lower retry", () => {
    const previous={bestScore:{earned:10,possible:10},completed:true,nextTopicAvailable:true,solved:true};
    expect(retainCodingProgress(previous,{earned:0,possible:10})).toEqual(previous);
    expect(previous.bestScore).toEqual({earned:10,possible:10});
  });
  it("never adds earned points across retries", () => {
    const previous={...empty,bestScore:{earned:40,possible:100}};
    expect(retainCodingProgress(previous,{earned:50,possible:100})).toEqual({...empty,bestScore:{earned:50,possible:100}});
  });
  it("retains the original denominator when its percentage is better", () => {
    const previous={bestScore:{earned:80,possible:100},completed:true,nextTopicAvailable:true,solved:false};
    expect(retainCodingProgress(previous,{earned:90,possible:150})).toEqual(previous);
  });
});
