import { defineConfig } from 'hardhat/config';
export default defineConfig({
  networks: { localMarket: { type: 'edr-simulated', chainType: 'l1', chainId: 31337, hardfork: 'cancun', loggingEnabled: false } },
});
