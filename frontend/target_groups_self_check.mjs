import assert from 'node:assert/strict'
import { buildCvTargetGroups } from './src/targetGroups.js'

const groups = buildCvTargetGroups([
  { id: 1, cv_id: 10, file_name: 'HR.pdf', position: 'HR Staff', location: 'Jakarta', platform: 'linkedin', employment_type: 'full_time', expected_salary: '6500000' },
  { id: 2, cv_id: 10, file_name: 'HR.pdf', position: 'HR Staff', location: 'Bekasi', platform: 'jobstreet', employment_type: 'full_time', expected_salary: '6500000' },
  { id: 3, cv_id: 10, file_name: 'HR.pdf', position: 'Recruiter', location: 'Jakarta', platform: 'linkedin_posts', employment_type: 'full_time', expected_salary: '6500000' },
  { id: 4, cv_id: 11, file_name: 'Finance.pdf', position: 'Auditor', location: 'Jakarta', platform: 'all', employment_type: 'contract' },
])

assert.equal(groups.length, 2)
assert.equal(groups[0].positions.size, 2)
assert.deepEqual([...groups[0].locations], ['Jakarta', 'Bekasi'])
assert.deepEqual([...groups[0].platforms], ['linkedin', 'jobstreet'])
assert.deepEqual([...groups[1].platforms], ['linkedin', 'jobstreet'])
console.log('target grouping self-check passed')
