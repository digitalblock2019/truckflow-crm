export default async function globalTeardown(): Promise<void> {
  // The test DB container outlives the test run by design (so a developer can
  // re-run quickly without rebooting Docker). Use `npm run test:db:down` to
  // stop it explicitly. Nothing to tear down here.
}
