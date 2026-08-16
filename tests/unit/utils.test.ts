import { describe, it, expect } from "vitest";
import { truncateText, toSlug, formatDate } from "@/lib/utils";

describe("lib/utils", () => {
  describe("truncateText", () => {
    it("should return the text as-is if it's shorter than maxLength", () => {
      const text = "Hello";
      const result = truncateText(text, 10);
      expect(result).toBe("Hello");
    });

    it("should truncate text and add ellipsis when longer than maxLength", () => {
      const text = "Hello World This is a long text";
      const result = truncateText(text, 11);
      expect(result).toBe("Hello World...");
    });

    it("should handle empty strings", () => {
      const result = truncateText("", 5);
      expect(result).toBe("");
    });
  });

  describe("toSlug", () => {
    it("should convert to lowercase", () => {
      const result = toSlug("HELLO WORLD");
      expect(result).toBe("hello-world");
    });

    it("should replace spaces with hyphens", () => {
      const result = toSlug("Hello World");
      expect(result).toBe("hello-world");
    });

    it("should remove special characters", () => {
      const result = toSlug("Hello! @World #123");
      expect(result).toBe("hello-world-123");
    });

    it("should trim whitespace", () => {
      const result = toSlug("  Hello World  ");
      expect(result).toBe("hello-world");
    });
  });

  describe("formatDate", () => {
    it("should format a date correctly", () => {
      const date = new Date("2025-01-15");
      const result = formatDate(date);
      expect(result).toContain("2025");
      expect(result).toContain("15");
    });

    it("should handle different dates", () => {
      const date = new Date("2026-08-16");
      const result = formatDate(date);
      expect(result).toContain("2026");
      expect(result).toContain("16");
    });
  });
});
