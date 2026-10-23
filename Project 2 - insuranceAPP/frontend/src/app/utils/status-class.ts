// Turns the status for payments into a CSS class
export const statusClass = (status: string) => 'status ' + status.toLowerCase().replace(/\s+/g, '-');