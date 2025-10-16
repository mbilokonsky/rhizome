/**
 * Example: Idea as Future State Planning
 * 
 * This example demonstrates using Rhizome to explore possible futures:
 * - An "Idea" is a possible future state
 * - System finds the cheapest path from current state → future state
 * - Multiple futures can be generated and compared
 * - Delta correlation determines which actions contribute to the goal
 * 
 * Use case: Planning, forecasting, multi-objective optimization
 */

import { StorageFactory } from '../src/storage/factory';
import { DeltaBuilder } from '../src/core/delta-builder';
import { SchemaBuilder, DefaultSchemaRegistry } from '../src/schema';
import { Hyperview } from '../src/views/hyperview';

// === SCHEMAS ===

/**
 * StateSnapshot: Captures a system's state at a point in time
 */
const StateSnapshotSchema = SchemaBuilder
  .create('state-snapshot')
  .name('State Snapshot')
  .description('A snapshot of system state at a specific time')
  .property('snapshotId', { type: 'primitive', primitiveType: 'string', required: true })
  .property('timestamp', { type: 'primitive', primitiveType: 'number', required: true })
  .property('description', { type: 'primitive', primitiveType: 'string' })
  // State dimensions (customize based on your domain)
  .property('revenue', { type: 'primitive', primitiveType: 'number' })
  .property('users', { type: 'primitive', primitiveType: 'number' })
  .property('features', { type: 'primitive', primitiveType: 'number' })
  .property('teamSize', { type: 'primitive', primitiveType: 'number' })
  .property('marketShare', { type: 'primitive', primitiveType: 'number' })
  .required('snapshotId', 'timestamp')
  .build();

/**
 * Idea: A possible future state we want to reach
 */
const IdeaSchema = SchemaBuilder
  .create('idea')
  .name('Idea')
  .description('A possible future state - where we want to be')
  .property('ideaId', { type: 'primitive', primitiveType: 'string', required: true })
  .property('name', { type: 'primitive', primitiveType: 'string', required: true })
  .property('description', { type: 'primitive', primitiveType: 'string' })
  .property('currentState', { type: 'reference', targetSchema: 'state-snapshot', required: true })
  .property('targetState', { type: 'reference', targetSchema: 'state-snapshot', required: true })
  .property('createdAt', { type: 'primitive', primitiveType: 'number', required: true })
  .property('priority', { type: 'primitive', primitiveType: 'number' }) // 1-10
  .required('ideaId', 'name', 'currentState', 'targetState', 'createdAt')
  .build();

/**
 * ActionDelta: A possible action that can transform state
 */
const ActionDeltaSchema = SchemaBuilder
  .create('action-delta')
  .name('Action Delta')
  .description('A possible action that transforms system state')
  .property('actionId', { type: 'primitive', primitiveType: 'string', required: true })
  .property('name', { type: 'primitive', primitiveType: 'string', required: true })
  .property('description', { type: 'primitive', primitiveType: 'string' })
  // What this action changes
  .property('revenueImpact', { type: 'primitive', primitiveType: 'number' })
  .property('userImpact', { type: 'primitive', primitiveType: 'number' })
  .property('featureImpact', { type: 'primitive', primitiveType: 'number' })
  .property('teamSizeImpact', { type: 'primitive', primitiveType: 'number' })
  .property('marketShareImpact', { type: 'primitive', primitiveType: 'number' })
  // Cost of taking this action
  .property('timeCost', { type: 'primitive', primitiveType: 'number' }) // days
  .property('moneyCost', { type: 'primitive', primitiveType: 'number' }) // dollars
  .property('effortCost', { type: 'primitive', primitiveType: 'number' }) // 1-10
  .required('actionId', 'name')
  .build();

/**
 * DeltaCorrelation: How much an action contributes to reaching an idea
 */
const DeltaCorrelationSchema = SchemaBuilder
  .create('delta-correlation')
  .name('Delta Correlation')
  .description('Correlation between an action and reaching an idea')
  .property('correlationId', { type: 'primitive', primitiveType: 'string', required: true })
  .property('ideaId', { type: 'reference', targetSchema: 'idea', required: true })
  .property('actionId', { type: 'reference', targetSchema: 'action-delta', required: true })
  .property('correlationScore', { type: 'primitive', primitiveType: 'number', required: true }) // 0-1
  .property('computedAt', { type: 'primitive', primitiveType: 'number', required: true })
  .required('correlationId', 'ideaId', 'actionId', 'correlationScore', 'computedAt')
  .build();

/**
 * Path: A sequence of actions leading from current state to target state
 */
const PathSchema = SchemaBuilder
  .create('path')
  .name('Path')
  .description('A sequence of actions to reach a future state')
  .property('pathId', { type: 'primitive', primitiveType: 'string', required: true })
  .property('ideaId', { type: 'reference', targetSchema: 'idea', required: true })
  .property('totalCost', { type: 'primitive', primitiveType: 'number', required: true })
  .property('estimatedDuration', { type: 'primitive', primitiveType: 'number' }) // days
  .property('successProbability', { type: 'primitive', primitiveType: 'number' }) // 0-1
  .property('computedAt', { type: 'primitive', primitiveType: 'number', required: true })
  // Actions are stored as separate deltas with path references
  .required('pathId', 'ideaId', 'totalCost', 'computedAt')
  .build();

/**
 * PathStep: One step in a path
 */
const PathStepSchema = SchemaBuilder
  .create('path-step')
  .name('Path Step')
  .description('One action in a path sequence')
  .property('stepId', { type: 'primitive', primitiveType: 'string', required: true })
  .property('pathId', { type: 'reference', targetSchema: 'path', required: true })
  .property('actionId', { type: 'reference', targetSchema: 'action-delta', required: true })
  .property('stepNumber', { type: 'primitive', primitiveType: 'number', required: true })
  .property('expectedImpact', { type: 'primitive', primitiveType: 'number' })
  .required('stepId', 'pathId', 'actionId', 'stepNumber')
  .build();

// === HELPER FUNCTIONS ===

/**
 * Calculate correlation between an action and reaching a target state
 */
function calculateCorrelation(
  action: any,
  currentState: any,
  targetState: any
): number {
  let totalAlignment = 0;
  let dimensions = 0;

  const stateDimensions = ['revenue', 'users', 'features', 'teamSize', 'marketShare'];

  for (const dim of stateDimensions) {
    const current = currentState[dim] || 0;
    const target = targetState[dim] || 0;
    const impact = action[`${dim}Impact`] || 0;

    if (target !== current) {
      // Does this action move us in the right direction?
      const gap = target - current;
      const alignment = gap > 0 ? Math.min(impact / gap, 1) : 0;
      totalAlignment += alignment;
      dimensions++;
    }
  }

  return dimensions > 0 ? totalAlignment / dimensions : 0;
}

/**
 * Calculate total cost of an action
 */
function calculateCost(action: any): number {
  const timeCost = action.timeCost || 0;
  const moneyCost = action.moneyCost || 0;
  const effortCost = action.effortCost || 0;

  // Weighted combination (customize weights for your domain)
  return (timeCost * 1) + (moneyCost * 0.01) + (effortCost * 10);
}

/**
 * Find optimal path using greedy algorithm
 * (In production, you'd use A*, dynamic programming, or ML)
 */
function findOptimalPath(
  ideaId: string,
  currentState: any,
  targetState: any,
  actions: any[],
  correlations: Map<string, number>,
  maxSteps = 10
): { steps: any[], totalCost: number, estimatedSuccess: number } {
  const path: any[] = [];
  let state = { ...currentState };
  let totalCost = 0;
  let remainingActions = [...actions];

  for (let i = 0; i < maxSteps; i++) {
    // Check if we've reached the target
    if (isStateReached(state, targetState)) {
      break;
    }

    // Find best next action (highest correlation / cost ratio)
    let bestAction: any = null;
    let bestScore = -Infinity;

    for (const action of remainingActions) {
      const correlation = correlations.get(action.actionId) || 0;
      const cost = calculateCost(action);
      const score = correlation / (cost + 1); // +1 to avoid division by zero

      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }

    if (!bestAction || bestScore <= 0) {
      break; // No more useful actions
    }

    // Apply action
    path.push(bestAction);
    totalCost += calculateCost(bestAction);
    state = applyAction(state, bestAction);
    remainingActions = remainingActions.filter(a => a.actionId !== bestAction.actionId);
  }

  // Estimate success probability based on how close we got
  const estimatedSuccess = calculateStateAlignment(state, targetState);

  return { steps: path, totalCost, estimatedSuccess };
}

/**
 * Check if we've reached the target state (within tolerance)
 */
function isStateReached(current: any, target: any, tolerance = 0.1): boolean {
  const dimensions = ['revenue', 'users', 'features', 'teamSize', 'marketShare'];
  
  for (const dim of dimensions) {
    const curr = current[dim] || 0;
    const targ = target[dim] || 0;
    
    if (targ > 0) {
      const ratio = curr / targ;
      if (ratio < (1 - tolerance)) {
        return false; // Haven't reached this dimension yet
      }
    }
  }
  
  return true;
}

/**
 * Apply an action to a state (simulate the impact)
 */
function applyAction(state: any, action: any): any {
  return {
    revenue: (state.revenue || 0) + (action.revenueImpact || 0),
    users: (state.users || 0) + (action.userImpact || 0),
    features: (state.features || 0) + (action.featureImpact || 0),
    teamSize: (state.teamSize || 0) + (action.teamSizeImpact || 0),
    marketShare: (state.marketShare || 0) + (action.marketShareImpact || 0)
  };
}

/**
 * Calculate how aligned a state is with the target (0-1)
 */
function calculateStateAlignment(current: any, target: any): number {
  const dimensions = ['revenue', 'users', 'features', 'teamSize', 'marketShare'];
  let totalAlignment = 0;
  let count = 0;

  for (const dim of dimensions) {
    const curr = current[dim] || 0;
    const targ = target[dim] || 0;

    if (targ > 0) {
      const alignment = Math.min(curr / targ, 1);
      totalAlignment += alignment;
      count++;
    }
  }

  return count > 0 ? totalAlignment / count : 0;
}

/**
 * Helper to create entity deltas
 */
function createEntityDeltas(entityId: string, properties: Record<string, any>, creator: string, host: string): any[] {
  const deltas = [];
  for (const [property, value] of Object.entries(properties)) {
    const delta = new DeltaBuilder(creator, host)
      .setProperty(entityId, property, value)
      .build();
    deltas.push(delta);
  }
  return deltas;
}

// === MAIN EXAMPLE ===

async function main() {
  console.log('=== Idea as Future State Planning ===\n');

  const creator = 'planner';
  const host = 'idea-futures';

  // Initialize storage
  const storage = StorageFactory.create({
    type: 'leveldb',
    path: './data/idea-futures'
  });

  console.log('✓ Storage initialized\n');

  // === STEP 1: Define Current State ===
  console.log('Step 1: Defining current state...\n');

  const currentState = {
    snapshotId: 'state:current',
    timestamp: Date.now(),
    description: 'Current state of our SaaS product',
    revenue: 10000,      // $10k MRR
    users: 100,          // 100 active users
    features: 5,         // 5 core features
    teamSize: 3,         // 3 team members
    marketShare: 0.01    // 1% market share
  };

  const currentDeltas = createEntityDeltas(
    currentState.snapshotId,
    currentState,
    creator,
    host
  );

  for (const delta of currentDeltas) {
    await storage.storeDelta(delta);
  }

  console.log('Current State:');
  console.log(`  Revenue: $${currentState.revenue}/mo`);
  console.log(`  Users: ${currentState.users}`);
  console.log(`  Features: ${currentState.features}`);
  console.log(`  Team: ${currentState.teamSize} people`);
  console.log(`  Market Share: ${(currentState.marketShare * 100).toFixed(1)}%\n`);

  // === STEP 2: Define Multiple Possible Futures (Ideas) ===
  console.log('Step 2: Defining possible future states...\n');

  const ideas = [
    {
      ideaId: 'idea:growth-focus',
      name: 'Growth-Focused Future',
      description: 'Prioritize user acquisition and revenue growth',
      currentState: currentState.snapshotId,
      targetState: 'state:growth-target',
      createdAt: Date.now(),
      priority: 9,
      target: {
        snapshotId: 'state:growth-target',
        timestamp: Date.now() + (365 * 24 * 60 * 60 * 1000), // 1 year from now
        description: 'High-growth target',
        revenue: 100000,    // $100k MRR (10x)
        users: 2000,        // 2000 users (20x)
        features: 8,        // +3 features
        teamSize: 10,       // 10 team members
        marketShare: 0.05   // 5% market share
      }
    },
    {
      ideaId: 'idea:quality-focus',
      name: 'Quality-Focused Future',
      description: 'Prioritize product quality and user satisfaction',
      currentState: currentState.snapshotId,
      targetState: 'state:quality-target',
      createdAt: Date.now(),
      priority: 7,
      target: {
        snapshotId: 'state:quality-target',
        timestamp: Date.now() + (365 * 24 * 60 * 60 * 1000),
        description: 'High-quality premium product',
        revenue: 50000,     // $50k MRR (5x, but higher per-user)
        users: 500,         // 500 users (5x, selective)
        features: 15,       // 15 features (deep not wide)
        teamSize: 8,        // 8 team members
        marketShare: 0.02   // 2% market share
      }
    },
    {
      ideaId: 'idea:bootstrap',
      name: 'Bootstrap Future',
      description: 'Sustainable growth without external funding',
      currentState: currentState.snapshotId,
      targetState: 'state:bootstrap-target',
      createdAt: Date.now(),
      priority: 8,
      target: {
        snapshotId: 'state:bootstrap-target',
        timestamp: Date.now() + (365 * 24 * 60 * 60 * 1000),
        description: 'Profitable and sustainable',
        revenue: 30000,     // $30k MRR
        users: 800,         // 800 users
        features: 7,        // 7 features (focused)
        teamSize: 5,        // 5 team members (lean)
        marketShare: 0.03   // 3% market share
      }
    }
  ];

  // Store ideas and their target states
  for (const idea of ideas) {
    // Store target state
    const targetDeltas = createEntityDeltas(
      idea.target.snapshotId,
      idea.target,
      creator,
      host
    );
    for (const delta of targetDeltas) {
      await storage.storeDelta(delta);
    }

    // Store idea
    const { target, ...ideaProps } = idea;
    const ideaDeltas = createEntityDeltas(
      idea.ideaId,
      ideaProps,
      creator,
      host
    );
    for (const delta of ideaDeltas) {
      await storage.storeDelta(delta);
    }

    console.log(`✓ Created idea: ${idea.name}`);
  }

  console.log();

  // === STEP 3: Define Possible Actions ===
  console.log('Step 3: Defining possible actions...\n');

  const actions = [
    {
      actionId: 'action:hire-engineer',
      name: 'Hire Software Engineer',
      description: 'Add engineering capacity',
      teamSizeImpact: 1,
      featureImpact: 2,
      timeCost: 60,
      moneyCost: 10000,
      effortCost: 8
    },
    {
      actionId: 'action:marketing-campaign',
      name: 'Run Marketing Campaign',
      description: 'Paid acquisition campaign',
      userImpact: 200,
      revenueImpact: 5000,
      marketShareImpact: 0.01,
      timeCost: 30,
      moneyCost: 15000,
      effortCost: 6
    },
    {
      actionId: 'action:build-feature',
      name: 'Build New Feature',
      description: 'Add major product feature',
      featureImpact: 1,
      userImpact: 50,
      revenueImpact: 2000,
      timeCost: 45,
      moneyCost: 5000,
      effortCost: 9
    },
    {
      actionId: 'action:improve-ux',
      name: 'Improve UX/Design',
      description: 'Enhance user experience',
      userImpact: 100,
      revenueImpact: 3000,
      timeCost: 30,
      moneyCost: 8000,
      effortCost: 7
    },
    {
      actionId: 'action:content-marketing',
      name: 'Content Marketing',
      description: 'Organic growth via content',
      userImpact: 150,
      revenueImpact: 4000,
      marketShareImpact: 0.005,
      timeCost: 90,
      moneyCost: 3000,
      effortCost: 5
    },
    {
      actionId: 'action:enterprise-sales',
      name: 'Enterprise Sales Push',
      description: 'Focus on high-value customers',
      userImpact: 20,
      revenueImpact: 15000,
      marketShareImpact: 0.01,
      timeCost: 120,
      moneyCost: 20000,
      effortCost: 9
    },
    {
      actionId: 'action:api-integrations',
      name: 'Build API Integrations',
      description: 'Connect with other tools',
      featureImpact: 3,
      userImpact: 100,
      revenueImpact: 3000,
      timeCost: 60,
      moneyCost: 7000,
      effortCost: 8
    }
  ];

  // Store actions
  for (const action of actions) {
    const deltas = createEntityDeltas(action.actionId, action, creator, host);
    for (const delta of deltas) {
      await storage.storeDelta(delta);
    }
  }

  console.log(`✓ Defined ${actions.length} possible actions\n`);

  // === STEP 4: Calculate Delta Correlations ===
  console.log('Step 4: Computing delta correlations...\n');

  for (const idea of ideas) {
    console.log(`Computing correlations for: ${idea.name}`);
    
    const correlations = new Map<string, number>();

    for (const action of actions) {
      const correlation = calculateCorrelation(action, currentState, idea.target);
      correlations.set(action.actionId, correlation);

      // Store correlation
      const correlationData = {
        correlationId: `correlation:${idea.ideaId}:${action.actionId}`,
        ideaId: idea.ideaId,
        actionId: action.actionId,
        correlationScore: correlation,
        computedAt: Date.now()
      };

      const deltas = createEntityDeltas(
        correlationData.correlationId,
        correlationData,
        creator,
        host
      );
      for (const delta of deltas) {
        await storage.storeDelta(delta);
      }
    }

    // Show top correlated actions
    const topActions = [...correlations.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    console.log('  Top correlated actions:');
    for (const [actionId, score] of topActions) {
      const action = actions.find(a => a.actionId === actionId);
      console.log(`    ${action?.name}: ${(score * 100).toFixed(1)}%`);
    }
    console.log();
  }

  // === STEP 5: Find Optimal Paths ===
  console.log('Step 5: Finding optimal paths to each future...\n');

  for (const idea of ideas) {
    console.log(`Finding path for: ${idea.name}`);

    // Get correlations for this idea
    const correlations = new Map<string, number>();
    for (const action of actions) {
      const correlation = calculateCorrelation(action, currentState, idea.target);
      correlations.set(action.actionId, correlation);
    }

    // Find optimal path
    const pathResult = findOptimalPath(
      idea.ideaId,
      currentState,
      idea.target,
      actions,
      correlations
    );

    // Calculate total duration from steps
    const totalDuration = pathResult.steps.reduce((sum, a) => sum + (a.timeCost || 0), 0);

    // Store path
    const pathData = {
      pathId: `path:${idea.ideaId}`,
      ideaId: idea.ideaId,
      totalCost: pathResult.totalCost,
      estimatedDuration: totalDuration,
      successProbability: pathResult.estimatedSuccess,
      computedAt: Date.now()
    };

    const pathDeltas = createEntityDeltas(pathData.pathId, pathData, creator, host);
    for (const delta of pathDeltas) {
      await storage.storeDelta(delta);
    }

    // Store path steps
    for (let i = 0; i < pathResult.steps.length; i++) {
      const action = pathResult.steps[i];
      const stepData = {
        stepId: `step:${pathData.pathId}:${i}`,
        pathId: pathData.pathId,
        actionId: action.actionId,
        stepNumber: i + 1,
        expectedImpact: correlations.get(action.actionId) || 0
      };

      const stepDeltas = createEntityDeltas(stepData.stepId, stepData, creator, host);
      for (const delta of stepDeltas) {
        await storage.storeDelta(delta);
      }
    }

    // Display path
    console.log(`  Total Cost: ${pathResult.totalCost.toFixed(0)}`);
    console.log(`  Duration: ${Math.round(totalDuration)} days`);
    console.log(`  Success Probability: ${(pathResult.estimatedSuccess * 100).toFixed(1)}%`);
    console.log(`  Path (${pathResult.steps.length} steps):`);
    for (let i = 0; i < pathResult.steps.length; i++) {
      const action = pathResult.steps[i];
      console.log(`    ${i + 1}. ${action.name}`);
    }
    console.log();
  }

  // === STEP 6: Compare Futures ===
  console.log('Step 6: Comparing possible futures...\n');

  console.log('Future Comparison:');
  console.log('─'.repeat(80));
  console.log('Idea                    | Cost    | Duration | Success | Priority');
  console.log('─'.repeat(80));

  for (const idea of ideas) {
    // Read back the path
    const pathDeltas = await storage.getDeltasForEntity(`path:${idea.ideaId}`);
    const pathData: any = {};
    for (const delta of pathDeltas) {
      for (const pointer of delta.pointers) {
        if (pointer.localContext !== 'entity' && typeof pointer.target !== 'string') {
          pathData[pointer.localContext] = pointer.target;
        }
      }
    }

    const cost = pathData.totalCost || 0;
    const duration = pathData.estimatedDuration || 0;
    const success = pathData.successProbability || 0;

    console.log(
      `${idea.name.padEnd(23)} | ${cost.toFixed(0).padStart(7)} | ${Math.round(duration).toString().padStart(8)} | ${(success * 100).toFixed(1).padStart(7)}% | ${idea.priority}`
    );
  }
  console.log('─'.repeat(80));

  console.log('\n=== Summary ===\n');
  console.log('This example demonstrated:');
  console.log('✓ Defining current and target states as deltas');
  console.log('✓ Creating multiple possible futures (ideas)');
  console.log('✓ Defining actions as deltas with impact metrics');
  console.log('✓ Computing correlation between actions and goals');
  console.log('✓ Finding optimal paths (cheapest sequence of deltas)');
  console.log('✓ Comparing multiple futures to choose the best one');
  console.log('\nAll data stored as deltas in LevelDB!');
  console.log('Storage: ./data/idea-futures');

  console.log('\n=== Next Steps ===\n');
  console.log('To use this pattern in production:');
  console.log('1. Define your state dimensions (customize StateSnapshot)');
  console.log('2. Create action library (all possible deltas)');
  console.log('3. Implement domain-specific correlation logic');
  console.log('4. Use A* or ML for better pathfinding');
  console.log('5. Add real-time updates as state changes');
  console.log('6. Build visualization for path comparison');
}

// Run the example
main().catch(console.error);

