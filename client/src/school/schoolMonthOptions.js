export const schoolMonthOptions = Array.from({ length: 12 }, (_, index) => {
  const label = new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date(2024, index, 1));
  return {
    value: String(index + 1).padStart(2, '0'),
    label: `${label.charAt(0).toLocaleUpperCase('id-ID')}${label.slice(1)}`
  };
});
