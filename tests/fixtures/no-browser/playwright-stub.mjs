// Playwright that imports fine but can launch nothing: the state a machine is in
// when the package is installed and no browser is.
const launch = async () => { throw new Error("browserType.launch: Executable doesn't exist"); };
export const chromium = { launch };
export const firefox = { launch };
export const webkit = { launch };
export default { chromium, firefox, webkit };
