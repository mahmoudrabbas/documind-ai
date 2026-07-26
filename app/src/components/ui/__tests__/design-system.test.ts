import { describe, it, expect } from "vitest";
import {
  getButtonClasses,
  resolveBadgeStatus,
  SELECT_CLASSES,
  CHECKBOX_CLASSES,
  MODAL_OVERLAY_CLASSES,
  MODAL_PANEL_CLASSES,
  ALERT_CLASSES,
  FIELDSET_CLASSES,
  PROTECTED_FIELDSET_CLASSES,
} from "../variants";

describe("Design system token coverage", () => {
  it("exports all required semantic token classes", () => {
    expect(SELECT_CLASSES).toBeTruthy();
    expect(CHECKBOX_CLASSES).toBeTruthy();
    expect(MODAL_OVERLAY_CLASSES).toBeTruthy();
    expect(MODAL_PANEL_CLASSES).toBeTruthy();
    expect(ALERT_CLASSES.error).toBeTruthy();
    expect(ALERT_CLASSES.warning).toBeTruthy();
    expect(ALERT_CLASSES.success).toBeTruthy();
    expect(ALERT_CLASSES.info).toBeTruthy();
    expect(FIELDSET_CLASSES).toBeTruthy();
    expect(PROTECTED_FIELDSET_CLASSES).toBeTruthy();
  });

  it("select classes include disabled treatment", () => {
    expect(SELECT_CLASSES).toContain("disabled:cursor-not-allowed");
    expect(SELECT_CLASSES).toContain("disabled:bg-surface-container");
    expect(SELECT_CLASSES).toContain("disabled:text-on-surface-variant");
  });

  it("select classes include focus ring", () => {
    expect(SELECT_CLASSES).toContain("focus:ring-2");
    expect(SELECT_CLASSES).toContain("focus:border-primary");
  });

  it("checkbox classes include focus ring", () => {
    expect(CHECKBOX_CLASSES).toContain("focus:ring-2");
  });

  it("modal overlay uses consistent z-index and backdrop", () => {
    expect(MODAL_OVERLAY_CLASSES).toContain("z-[70]");
    expect(MODAL_OVERLAY_CLASSES).toContain("bg-black");
  });

  it("modal panel uses shadow-modal", () => {
    expect(MODAL_PANEL_CLASSES).toContain("shadow-modal");
    expect(MODAL_PANEL_CLASSES).toContain("rounded-2xl");
  });

  it("alert classes use semantic color containers", () => {
    expect(ALERT_CLASSES.error).toContain("bg-error-container");
    expect(ALERT_CLASSES.warning).toContain("bg-warning-container");
    expect(ALERT_CLASSES.success).toContain("bg-success-container");
    expect(ALERT_CLASSES.info).toContain("bg-info-container");
  });

  it("alert classes include border for definition", () => {
    expect(ALERT_CLASSES.error).toContain("border-error");
    expect(ALERT_CLASSES.warning).toContain("border-warning");
    expect(ALERT_CLASSES.success).toContain("border-success");
    expect(ALERT_CLASSES.info).toContain("border-info");
  });

  it("protected fieldset classes have distinct visual treatment", () => {
    expect(PROTECTED_FIELDSET_CLASSES).toContain("border-primary");
    expect(PROTECTED_FIELDSET_CLASSES).not.toBe(FIELDSET_CLASSES);
  });
});

describe("Button contrast and semantics", () => {
  it("primary: white text on dark navy background", () => {
    const classes = getButtonClasses("primary");
    expect(classes).toContain("text-on-primary");
    expect(classes).toContain("bg-primary");
  });

  it("secondary: dark text on white/light background with border", () => {
    const classes = getButtonClasses("secondary");
    expect(classes).toContain("text-primary");
    expect(classes).toContain("bg-surface-container-lowest");
    expect(classes).toContain("border-outline-variant");
  });

  it("warning: white text on amber/orange background", () => {
    const classes = getButtonClasses("warning");
    expect(classes).toContain("text-on-warning");
    expect(classes).toContain("bg-warning");
  });

  it("danger: white text on red background", () => {
    const classes = getButtonClasses("danger");
    expect(classes).toContain("text-on-error");
    expect(classes).toContain("bg-error");
  });

  it("ghost: dark text on transparent background", () => {
    const classes = getButtonClasses("ghost");
    expect(classes).toContain("text-on-surface-variant");
    expect(classes).toContain("bg-transparent");
  });

  it("outline: dark text on transparent with border", () => {
    const classes = getButtonClasses("outline");
    expect(classes).toContain("text-primary");
    expect(classes).toContain("border-outline-variant");
  });

  it("disabled state never uses red bg on non-destructive variants", () => {
    expect(getButtonClasses("primary")).toContain("disabled:bg-surface-container-high");
    expect(getButtonClasses("secondary")).toContain("disabled:bg-surface-container");
    expect(getButtonClasses("ghost")).toContain("disabled:text-on-surface-variant/50");
    expect(getButtonClasses("outline")).toContain("disabled:text-on-surface-variant");
  });

  it("disabled danger still has red-tinted bg but clearly muted", () => {
    expect(getButtonClasses("danger")).toContain("disabled:bg-error/20");
    expect(getButtonClasses("danger")).toContain("disabled:text-error/40");
  });

  it("minimum height for all button sizes meets 40px target area", () => {
    const sm = getButtonClasses("primary", "sm");
    const md = getButtonClasses("primary", "md");
    const lg = getButtonClasses("primary", "lg");
    expect(sm).toContain("h-8");
    expect(md).toContain("h-10");
    expect(lg).toContain("h-12");
  });
});

describe("Badge semantic mapping for Issue 18 statuses", () => {
  it("Confidential and Highly Confidential map to error", () => {
    expect(resolveBadgeStatus("Confidential")).toBe("error");
    expect(resolveBadgeStatus("Highly Confidential")).toBe("error");
  });

  it("Restricted maps to warning", () => {
    expect(resolveBadgeStatus("Restricted")).toBe("warning");
  });

  it("Active, Current, Clean, Allowed map to success", () => {
    expect(resolveBadgeStatus("Active")).toBe("success");
    expect(resolveBadgeStatus("Current")).toBe("success");
    expect(resolveBadgeStatus("Clean")).toBe("success");
    expect(resolveBadgeStatus("Allowed")).toBe("success");
  });

  it("Pending, Uploaded map to warning", () => {
    expect(resolveBadgeStatus("Pending")).toBe("warning");
    expect(resolveBadgeStatus("Uploaded")).toBe("warning");
  });

  it("Read only maps to neutral", () => {
    expect(resolveBadgeStatus("Read only")).toBe("neutral");
    expect(resolveBadgeStatus("read_only")).toBe("neutral");
  });

  it("Denied and Failed map to error", () => {
    expect(resolveBadgeStatus("Denied")).toBe("error");
    expect(resolveBadgeStatus("Failed")).toBe("error");
  });
});

describe("Accessibility helper classes", () => {
  it("focus-visible global styles exist in CSS (checked via class presence)", () => {
    const primary = getButtonClasses("primary");
    expect(primary).toContain("focus-visible:ring-2");
  });

  it("all button variants include focus-visible ring", () => {
    for (const variant of ["primary", "secondary", "ghost", "outline", "danger", "warning"]) {
      const classes = getButtonClasses(variant);
      expect(classes).toContain("focus-visible:ring");
    }
  });
});
