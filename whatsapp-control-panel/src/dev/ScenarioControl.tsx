import { useQueryClient } from '@tanstack/react-query';
import {
  overviewScenarios,
  type OverviewScenario
} from '../mocks/fixtures';
import { setOverviewScenario } from '../mocks/scenario';
import { overviewQueryKey } from '../api/queries';

const ScenarioControl = () => {
  const queryClient = useQueryClient();

  const switchScenario = async (scenario: OverviewScenario) => {
    setOverviewScenario(scenario);
    await queryClient.invalidateQueries({ queryKey: overviewQueryKey });
  };

  return (
    <label className="scenario-control">
      <span>Mock scenario</span>
      <select
        defaultValue="healthy"
        onChange={(event) =>
          void switchScenario(event.target.value as OverviewScenario)
        }
      >
        {Object.keys(overviewScenarios).map((scenario) => (
          <option key={scenario} value={scenario}>
            {scenario.replaceAll('_', ' ')}
          </option>
        ))}
      </select>
    </label>
  );
};

export default ScenarioControl;
