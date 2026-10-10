// Map key for amenity types. Colours chosen to stay distinguishable on OSM tiles in both themes;
// every use pairs colour with a text label (legend, list, tooltip), never colour alone.
export const POI_GROUPS = [
  { id: 'education', label: 'Education', color: '#2F64B0', types: ['school', 'college'] },
  { id: 'health', label: 'Health', color: '#B23A48', types: ['hospital', 'clinic', 'pharmacy'] },
  { id: 'safety', label: 'Emergency services', color: '#6B4FA0', types: ['police', 'fire_station'] },
  { id: 'transport', label: 'Transport', color: '#B9770E', types: ['bus_stop', 'rail_station'] },
  { id: 'essentials', label: 'Essentials', color: '#1F7A6B', types: ['grocery', 'bank'] },
  { id: 'green', label: 'Parks', color: '#4F8A2B', types: ['park'] },
  { id: 'development', label: 'Construction', color: '#7A5C3E', types: ['construction'] },
];
export const POI_TYPE_LABEL = {
  school: 'School', college: 'College / university', hospital: 'Hospital', clinic: 'Clinic', pharmacy: 'Pharmacy', police: 'Police station',
  fire_station: 'Fire station', bus_stop: 'Bus stop', rail_station: 'Rail / metro station', grocery: 'Grocery / market', bank: 'Bank / ATM', park: 'Park', construction: 'Construction site',
};
export const groupOf = (type) => POI_GROUPS.find((g) => g.types.includes(type));
