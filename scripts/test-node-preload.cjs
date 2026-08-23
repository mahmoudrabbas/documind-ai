// Test-only Windows workaround: tsx prefers process.geteuid when present and
// otherwise calls os.userInfo(), which is failing in this restricted runner.
if (typeof process.geteuid !== "function") {
  process.geteuid = () => 0;
}
