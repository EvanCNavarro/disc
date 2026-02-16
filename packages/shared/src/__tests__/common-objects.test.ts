import { describe, expect, test } from "vitest";
import { COMMON_OBJECTS, getRandomSubjects } from "../common-objects";

describe("common-objects", () => {
	test("has exactly 100 objects", () => {
		expect(COMMON_OBJECTS).toHaveLength(100);
	});

	test("all entries are non-empty strings", () => {
		for (const obj of COMMON_OBJECTS) {
			expect(typeof obj).toBe("string");
			expect(obj.length).toBeGreaterThan(0);
		}
	});

	test("no duplicates", () => {
		const unique = new Set(COMMON_OBJECTS);
		expect(unique.size).toBe(COMMON_OBJECTS.length);
	});

	test("getRandomSubjects returns requested count", () => {
		const subjects = getRandomSubjects(4);
		expect(subjects).toHaveLength(4);
	});

	test("getRandomSubjects returns unique items", () => {
		const subjects = getRandomSubjects(4);
		const unique = new Set(subjects);
		expect(unique.size).toBe(4);
	});
});
