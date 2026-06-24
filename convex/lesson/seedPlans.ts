// Hand-authored, rulebook-valid canonical plan. Used to seed an approved plan so
// the engine can be built/tested before live GPT-5.5 generation is available, and
// as a fixture for the plan validator test.

import type { LessonPlan } from './plan';

export const arraysIntroPlan: LessonPlan = {
  lessonId: 'arrays_intro_01',
  title: 'Multiplication as arrays',
  ageBand: '7-10',
  skillTag: 'multiplication_as_arrays',
  objective: 'Understand multiplication as equal rows and columns (an array).',
  prerequisites: ['number_sense_basic', 'multiplication_as_groups'],
  estimatedMinutes: 12,
  warmUp: {
    id: 'warmup_count_rows',
    prompt: 'Make 2 rows with 3 counters in each row.',
    answerType: 'manipulative',
    manipulative: { kind: 'array', rows: 2, columns: 3 },
    hints: [
      'Start with one row of 3 counters.',
      'Now make a second row that looks exactly the same.',
      'Put 3 in the first row, then 3 in the second row — that is 2 rows of 3.'
    ],
    misconceptions: ['unequal_groups', 'counting_slip']
  },
  concept:
    'An array is a tidy picture of multiplication. The counters are lined up in equal rows and equal columns. The number of rows times the number in each row tells us the total.',
  workedExample: {
    narration:
      'For 3 times 4, I make 3 rows. In each row I put 4 counters. Every row matches. Then I count them all: 12. So 3 times 4 is 12.',
    demo: { kind: 'array', rows: 3, columns: 4 }
  },
  practice: [
    {
      id: 'array_3x4_build',
      prompt: 'Build an array with 3 rows and 4 counters in each row.',
      answerType: 'manipulative',
      manipulative: { kind: 'array', rows: 3, columns: 4 },
      hints: [
        'Start with one row of 4.',
        'Now make two more rows that look the same.',
        'Check: does every row have 4 counters? You need 3 rows like that.'
      ],
      misconceptions: ['rows_columns_confused', 'unequal_groups', 'counting_slip']
    },
    {
      id: 'array_2x5_build',
      prompt: 'Build 2 rows with 5 counters in each row.',
      answerType: 'manipulative',
      manipulative: { kind: 'array', rows: 2, columns: 5 },
      hints: [
        'Make one row of 5 first.',
        'Add one more row that matches it.',
        'Two rows, 5 in each — count them to check you have 10.'
      ],
      misconceptions: ['unequal_groups', 'counting_slip']
    }
  ],
  masteryCheck: {
    id: 'array_4x5_prove',
    prompt: 'Build 4 rows of 5 to show what 4 times 5 looks like, then tell me the total.',
    answerType: 'manipulative',
    manipulative: { kind: 'array', rows: 4, columns: 5 },
    hints: [
      'How many rows do you need? How many in each row?',
      'Make each row the same size.',
      'Build 4 rows with 5 in each, then count: that is 20.'
    ],
    misconceptions: ['rows_columns_confused', 'unequal_groups', 'counting_slip']
  },
  reflection: {
    prompt: 'What helped you most today?',
    choices: ['Building the rows', 'The hints', 'Counting out loud', 'The example']
  },
  parentInsight: {
    skillTags: ['multiplication_as_arrays'],
    improvedTemplate: '{child} is starting to see multiplication as equal rows and columns.',
    trickyTemplate: '{child} sometimes mixes up the number of rows with the number in each row.'
  }
};
