export function normalizeTargetText(value) {
  return (value || '').toString().trim().toLowerCase().replace(/\s+/g, ' ')
}

export function buildCvTargetGroups(targets = []) {
  return Object.values(targets.reduce((groups, target) => {
    const key = String(target.cv_id || target.file_name || 'cv')
    if (!groups[key]) {
      groups[key] = {
        cvId: target.cv_id,
        cvName: target.file_name || target.position_label || 'CV',
        positions: new Map(),
        locations: new Set(),
        platforms: new Set(),
        employmentTypes: new Set(),
        salaries: new Set(),
        availableJoin: new Set(),
      }
    }
    const group = groups[key]
    const positionKey = normalizeTargetText(target.position)
    if (!group.positions.has(positionKey)) group.positions.set(positionKey, target)
    if (target.location) group.locations.add(target.location)
    if (target.employment_type) group.employmentTypes.add(target.employment_type)
    if (target.expected_salary) group.salaries.add(target.expected_salary)
    if (target.available_join) group.availableJoin.add(target.available_join)

    const platforms = ['all', 'both'].includes(target.platform)
      ? ['linkedin', 'jobstreet']
      : [target.platform]
    platforms.forEach(platform => {
      if (platform) group.platforms.add(platform === 'linkedin_posts' ? 'linkedin' : platform)
    })
    return groups
  }, {}))
}
