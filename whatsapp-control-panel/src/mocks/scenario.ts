import {
  healthyOverview,
  overviewScenarios,
  type OverviewScenario
} from './fixtures';

let activeScenario: OverviewScenario = 'healthy';

export const setOverviewScenario = (scenario: OverviewScenario): void => {
  activeScenario = scenario;
};

export const getOverviewScenario = () =>
  overviewScenarios[activeScenario] ?? healthyOverview;
