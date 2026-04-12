export interface ServiceInfo {
  uuid: string;
  name: string;
  category: string;
}

export interface ManufacturerInfo {
  id: number;
  name: string;
}

export interface DevicePattern {
  pattern: RegExp;
  name: string;
  type: string;
  category: string;
  manufacturer?: string;
}

export interface BeaconType {
  key?: string;
  type: string;
  format: string;
  details?: string[];
}

export interface BeaconDetectionInput {
  serviceUuids: string[];
  serviceData: Array<{ uuid: string; data: DataView }>;
  manufacturerData: Array<{ id: number; data: DataView }>;
}

export const SERVICE_UUIDS: Record<string, ServiceInfo> = {
  '1801': { uuid: '1801', name: 'GAP Service', category: 'Generic Access' },
  '1802': { uuid: '1802', name: 'GATT Service', category: 'Generic Attribute' },
  '1803': { uuid: '1803', name: 'Heart Rate', category: 'Health' },
  '1804': { uuid: '1804', name: 'Blood Pressure', category: 'Health' },
  '1805': { uuid: '1805', name: 'Environmental Sensing', category: 'Environment' },
  '1806': { uuid: '1806', name: 'Device Information', category: 'Generic' },
  '1807': { uuid: '1807', name: 'Continuous Glucose Monitoring', category: 'Health' },
  '1808': { uuid: '1808', name: 'Blood Pressure Profile', category: 'Health' },
  '1809': { uuid: '1809', name: 'User Data', category: 'Health' },
  '180a': { uuid: '180a', name: 'Phone Alert Status', category: 'Phone' },
  '180d': { uuid: '180d', name: 'Heart Rate', category: 'Health' },
  '180f': { uuid: '180f', name: 'Battery Service', category: 'Generic' },
  '1810': { uuid: '1810', name: 'Blood Pressure', category: 'Health' },
  '1811': { uuid: '1811', name: 'Alert Notification', category: 'Phone' },
  '1812': { uuid: '1812', name: 'Human Interface Device', category: 'Input' },
  '1813': { uuid: '1813', name: 'Scan Parameters', category: 'Generic' },
  '1814': { uuid: '1814', name: 'Cycling Speed and Cadence', category: 'Fitness' },
  '1815': { uuid: '1815', name: 'Cycling Power', category: 'Fitness' },
  '1816': { uuid: '1816', name: 'Running Speed and Cadence', category: 'Fitness' },
  '1817': { uuid: '1817', name: 'User Data', category: 'Health' },
  '1818': { uuid: '1818', name: 'Weight Scale', category: 'Health' },
  '1819': { uuid: '1819', name: 'Bond Management', category: 'Security' },
  '181a': { uuid: '181a', name: 'Location and Navigation', category: 'Navigation' },
  '181b': { uuid: '181b', name: 'Body Composition', category: 'Health' },
  '181c': { uuid: '181c', name: 'User Data', category: 'Health' },
  '181d': { uuid: '181d', name: 'Weight Scale', category: 'Health' },
  '181e': { uuid: '181e', name: 'Bond Management', category: 'Security' },
  '181f': { uuid: '181f', name: 'Sensor Location', category: 'Fitness' },
  '1820': { uuid: '1820', name: 'Ambient Light', category: 'Environment' },
  '1821': { uuid: '1821', name: 'Keyboard', category: 'Input' },
  '1822': { uuid: '1822', name: 'Touchpad', category: 'Input' },
  '1823': { uuid: '1823', name: 'Automation IO', category: 'IoT' },
  '1824': { uuid: '1824', name: 'Odor Sensor', category: 'Environment' },
  '1825': { uuid: '1825', name: 'Motion Sensor', category: 'Motion' },
  '1826': { uuid: '1826', name: 'Fitness Machine', category: 'Fitness' },
  '1827': { uuid: '1827', name: 'Mesh Provisioning', category: 'Mesh' },
  '1828': { uuid: '1828', name: 'Mesh Proxy', category: 'Mesh' },
  '1829': { uuid: '1829', name: 'Reconnection Configuration', category: 'Generic' },
  '182a': { uuid: '182a', name: 'Insulin Delivery', category: 'Health' },
  '182b': { uuid: '182b', name: 'Binary Sensor', category: 'IoT' },
  '182c': { uuid: '182c', name: 'Emergency Alert', category: 'Health' },
  '182d': { uuid: '182d', name: 'Microphone', category: 'Audio' },
  '182e': { uuid: '182e', name: 'Traffic Direction', category: 'Navigation' },
  '182f': { uuid: '182f', name: 'Audio Control', category: 'Audio' },
  '1830': { uuid: '1830', name: 'Volume Control', category: 'Audio' },
  '1831': { uuid: '1831', name: 'Audio Input Control', category: 'Audio' },
  '1832': { uuid: '1832', name: 'Volume Offset Control', category: 'Audio' },
  '1833': { uuid: '1833', name: 'Audio Description', category: 'Audio' },
  '1834': { uuid: '1834', name: 'Hearing Aid', category: 'Health' },
  '1835': { uuid: '1835', name: 'Hearing Aid Preset', category: 'Health' },
  '1836': { uuid: '1836', name: 'Fuel', category: 'Vehicle' },
  '1837': { uuid: '1837', name: 'RFU Test', category: 'Testing' },
  '1838': { uuid: '1838', name: 'Baking', category: 'Health' },
  '1839': { uuid: '1839', name: 'PIV', category: 'Security' },
  '183a': { uuid: '183a', name: 'Visual Impairment', category: 'Health' },
  '183b': { uuid: '183b', name: 'Hearing Accessibility', category: 'Health' },
  '183c': { uuid: '183c', name: 'Time', category: 'Generic' },
  '183d': { uuid: '183d', name: 'Broadcast Audio', category: 'Audio' },
  '183e': { uuid: '183e', name: 'Supported Sample Rate', category: 'Audio' },
  '183f': { uuid: '183f', name: 'HMAC', category: 'Security' },
  '1840': { uuid: '1840', name: 'APS', category: 'Security' },
  '1841': { uuid: '1841', name: 'RDK', category: 'Security' },
  '1842': { uuid: '1842', name: 'Time Profile', category: 'Generic' },
  '1843': { uuid: '1843', name: 'Nurse Station', category: 'Healthcare' },
  '1844': { uuid: '1844', name: 'Visual Impairment VO', category: 'Health' },
  '1845': { uuid: '1845', name: 'Fitness Machine', category: 'Fitness' },
  '1846': { uuid: '1846', name: 'Continuous Glucose', category: 'Health' },
  '1847': { uuid: '1847', name: 'Application Layer', category: 'Generic' },
  '1848': { uuid: '1848', name: 'Material Properties', category: 'Environment' },
  '1849': { uuid: '1849', name: 'Samplings', category: 'Generic' },
  '184a': { uuid: '184a', name: 'GNS', category: 'Navigation' },
  '184b': { uuid: '184b', name: 'PLS', category: 'Generic' },
  '184c': { uuid: '184c', name: 'BXS', category: 'Generic' },
  '184d': { uuid: '184d', name: 'ESS', category: 'Environment' },
  '184e': { uuid: '184e', name: 'HRP', category: 'Health' },
  '184f': { uuid: '184f', name: 'Ear BIF', category: 'Audio' },
  '1850': { uuid: '1850', name: 'Fitness Machine Admin', category: 'Fitness' },
  '1851': { uuid: '1851', name: 'GFPS', category: 'Generic' },
  '1852': { uuid: '1852', name: 'Enhanced Blood Pressure', category: 'Health' },
  '1853': { uuid: '1853', name: 'Compressed Climate', category: 'Vehicle' },
  '1854': { uuid: '1854', name: 'Ota', category: 'Generic' },
  '1855': { uuid: '1855', name: 'Pulsoid', category: 'Health' },
  '1856': { uuid: '1856', name: 'WR2022', category: 'Generic' },
  '1857': { uuid: '1857', name: 'ALS', category: 'Environment' },
  '1858': { uuid: '1858', name: 'ECG', category: 'Health' },
  '1859': { uuid: '1859', name: 'EEG', category: 'Health' },
  '185a': { uuid: '185a', name: 'EMG', category: 'Health' },
  '185b': { uuid: '185b', name: 'Eye Tracker', category: 'Input' },
  '185c': { uuid: '185c', name: 'SpO2', category: 'Health' },
  '185d': { uuid: '185d', name: 'UV Index', category: 'Environment' },
  '185e': { uuid: '185e', name: 'NO2', category: 'Environment' },
  '185f': { uuid: '185f', name: 'CO2', category: 'Environment' },
  '1860': { uuid: '1860', name: 'NO', category: 'Environment' },
  '1861': { uuid: '1861', name: 'Ozone', category: 'Environment' },
  '1862': { uuid: '1862', name: 'Gas Sensor', category: 'Environment' },
  '1863': { uuid: '1863', name: 'COPD', category: 'Health' },
  '1864': { uuid: '1864', name: 'Sleep', category: 'Health' },
  '1865': { uuid: '1865', name: 'Handheld', category: 'Input' },
  '1866': { uuid: '1866', name: 'LFaH', category: 'Health' },
  '1867': { uuid: '1867', name: 'LHb', category: 'Health' },
  '1868': { uuid: '1868', name: 'Water Monitor', category: 'Environment' },
  '1869': { uuid: '1869', name: 'Weight Scale Ext', category: 'Health' },
  '186a': { uuid: '186a', name: 'Glucose Monitor', category: 'Health' },
  '186b': { uuid: '186b', name: 'BPM', category: 'Health' },
  '186c': { uuid: '186c', name: 'FMP', category: 'Fitness' },
  '186d': { uuid: '186d', name: 'IPS', category: 'Indoor Positioning' },
  '186e': { uuid: '186e', name: 'RSi', category: 'IoT' },
  '186f': { uuid: '186f', name: 'LRSi', category: 'IoT' },
  '1870': { uuid: '1870', name: 'ILAS', category: 'Indoor Positioning' },
  '1871': { uuid: '1871', name: 'PLX', category: 'Health' },
  '1872': { uuid: '1872', name: 'MDS', category: 'Health' },
  '1873': { uuid: '1873', name: 'CGM', category: 'Health' },
  '1874': { uuid: '1874', name: 'ARFS', category: 'Audio' },
  '1875': { uuid: '1875', name: 'CGMS', category: 'Health' },
  '1876': { uuid: '1876', name: 'MBG', category: 'Health' },
  '1877': { uuid: '1877', name: 'ALS', category: 'Audio' },
  '1878': { uuid: '1878', name: 'ECG', category: 'Health' },
  '1879': { uuid: '1879', name: 'RPa', category: 'Health' },
  '187a': { uuid: '187a', name: 'CCP', category: 'Generic' },
  '187b': { uuid: '187b', name: 'HID', category: 'Input' },
  '187c': { uuid: '187c', name: 'HRB', category: 'Health' },
  '187d': { uuid: '187d', name: 'HRPExt', category: 'Health' },
  '187e': { uuid: '187e', name: 'E2E', category: 'Generic' },
  '187f': { uuid: '187f', name: 'RSC', category: 'Fitness' },
  '1880': { uuid: '1880', name: 'RSCProfile', category: 'Fitness' },
  '1881': { uuid: '1881', name: 'SC', category: 'Fitness' },
  '1882': { uuid: '1882', name: 'WS', category: 'Health' },
  '1883': { uuid: '1883', name: 'AUDEG', category: 'Audio' },
  '1884': { uuid: '1884', name: 'HRCE', category: 'Health' },
  '1885': { uuid: '1885', name: 'HRCG', category: 'Health' },
  '1886': { uuid: '1886', name: 'TMD', category: 'Generic' },
  '1887': { uuid: '1887', name: 'HIDOverGATT', category: 'Input' },
  '1888': { uuid: '1888', name: 'TIPH', category: 'Generic' },
  '1889': { uuid: '1889', name: 'Hearth Rate', category: 'Health' },
  '188a': { uuid: '188a', name: 'CGMS', category: 'Health' },
  '188b': { uuid: '188b', name: 'RTLS', category: 'Location' },
  '188c': { uuid: '188c', name: 'ATP', category: 'Generic' },
  '188d': { uuid: '188d', name: 'TMAP', category: 'Generic' },
  '188e': { uuid: '188e', name: 'CAP', category: 'Generic' },
  '188f': { uuid: '188f', name: 'BCS', category: 'Health' },
  '1890': { uuid: '1890', name: 'HTP', category: 'Health' },
  '1891': { uuid: '1891', name: 'HDP', category: 'Health' },
  '1892': { uuid: '1892', name: 'FMP', category: 'Fitness' },
  '1893': { uuid: '1893', name: 'RTLS', category: 'Location' },
  '1894': { uuid: '1894', name: 'TIPH', category: 'Generic' },
  '1895': { uuid: '1895', name: 'HRCE', category: 'Health' },
  '1896': { uuid: '1896', name: 'HRCG', category: 'Health' },
  '1897': { uuid: '1897', name: 'TMD', category: 'Generic' },
  '1898': { uuid: '1898', name: 'HIDOverGATT', category: 'Input' },
  '1899': { uuid: '1899', name: 'CAP', category: 'Generic' },
  '189a': { uuid: '189a', name: 'BCS', category: 'Health' },
  '189b': { uuid: '189b', name: 'HTP', category: 'Health' },
  '189c': { uuid: '189c', name: 'HDP', category: 'Health' },
  '189d': { uuid: '189d', name: 'RTLS', category: 'Location' },
  '189e': { uuid: '189e', name: 'ATP', category: 'Generic' },
  '189f': { uuid: '189f', name: 'TMAP', category: 'Generic' },
  '18a0': { uuid: '18a0', name: 'RWP', category: 'Generic' },
  '18a1': { uuid: '18a1', name: 'AWS', category: 'Generic' },
  '18a2': { uuid: '18a2', name: 'BLP', category: 'Health' },
  '18a3': { uuid: '18a3', name: 'ESG', category: 'Environment' },
  '18a4': { uuid: '18a4', name: 'CVS', category: 'Health' },
  '18a5': { uuid: '18a5', name: 'RSCS', category: 'Fitness' },
  '18a6': { uuid: '18a6', name: 'SI', category: 'Fitness' },
  '18a7': { uuid: '18a7', name: 'AHI', category: 'Health' },
  '18a8': { uuid: '18a8', name: 'PHD', category: 'Health' },
  '18a9': { uuid: '18a9', name: 'AMA', category: 'Generic' },
  '18aa': { uuid: '18aa', name: 'HIDS', category: 'Input' },
  '18ab': { uuid: '18ab', name: 'FPS', category: 'Generic' },
  '18ac': { uuid: '18ac', name: 'CGMS', category: 'Health' },
  '18ad': { uuid: '18ad', name: 'BP', category: 'Health' },
  '18ae': { uuid: '18ae', name: 'FE', category: 'Generic' },
  '18af': { uuid: '18af', name: 'VP', category: 'Generic' },
  '1d14': { uuid: '1d14', name: 'Steam VR', category: 'VR' },
  '6e400001': { uuid: '6e400001', name: 'Nordic UART', category: 'IoT' },
  d0611e78: { uuid: 'd0611e78', name: 'Xiaomi Mi Band', category: 'Fitness' },
  '0000fe00': { uuid: '0000fe00', name: 'Unknown (Eddystone-like)', category: 'Beacon' },
  feaa: { uuid: 'feaa', name: 'Eddystone', category: 'Beacon' },
  a3c87500: { uuid: 'a3c87500', name: 'Eddystone UID', category: 'Beacon' },
  a3c87501: { uuid: 'a3c87501', name: 'Eddystone URL', category: 'Beacon' },
  a3c87502: { uuid: 'a3c87502', name: 'Eddystone TLM', category: 'Beacon' },
  a3c87503: { uuid: 'a3c87503', name: 'Eddystone EID', category: 'Beacon' },
};

export const SERVICE_FILTER_MAP: Record<string, string[]> = {
  heart_rate: ['180d'],
  blood_pressure: ['1810'],
  glucose: ['180f', '1810', '1804'],
  cycling_speed_cadence: ['1814'],
  running_cadence: ['1816'],
  user_data: ['1809', '1817', '181c'],
  bond_management: ['1819', '181e'],
  audio: ['182d', '182f', '1830', '1831', '1832', '1833'],
  ventilator: ['1838'],
  automation_io: ['1823'],
  beacon: ['feaa', 'a3c87500', 'a3c87501', 'a3c87502', 'a3c87503'],
};

function buildServiceUuidAliases(uuid: string): Set<string> {
  const aliases = new Set<string>();
  const normalized = uuid.toLowerCase().replace(/-/g, '');
  if (!normalized) {
    return aliases;
  }

  aliases.add(normalized);
  aliases.add(normalized.replace(/^0+/, '') || '0');

  // Convert Bluetooth base UUIDs to their 16-bit short aliases when possible.
  const bluetoothBaseMatch = normalized.match(/^0000([0-9a-f]{4})00001000800000805f9b34fb$/);
  if (bluetoothBaseMatch?.[1]) {
    aliases.add(bluetoothBaseMatch[1]);
  }

  return aliases;
}

export function getMatchingServiceFilters(uuids: string[]): string[] {
  if (uuids.length === 0) {
    return [];
  }

  const normalizedServices = new Set<string>();
  for (const uuid of uuids) {
    const aliases = buildServiceUuidAliases(uuid);
    for (const alias of aliases) {
      normalizedServices.add(alias);
    }
  }

  const matchedFilters: string[] = [];
  for (const [filterName, filterServices] of Object.entries(SERVICE_FILTER_MAP)) {
    const matchesFilter = filterServices.some((service) => normalizedServices.has(service));
    if (matchesFilter) {
      matchedFilters.push(filterName);
    }
  }

  return matchedFilters;
}

export const MANUFACTURER_IDS: Record<number, ManufacturerInfo> = {
  0x004c: { id: 0x004c, name: 'Apple, Inc.' },
  0x0006: { id: 0x0006, name: 'Microsoft' },
  0x000d: { id: 0x000d, name: 'Texas Instruments' },
  0x001d: { id: 0x001d, name: 'Qualcomm' },
  0x0024: { id: 0x0024, name: 'Broadcom' },
  0x003e: { id: 0x003e, name: 'Maxlinear' },
  0x0059: { id: 0x0059, name: 'Nordic Semiconductor' },
  0x006f: { id: 0x006f, name: 'BlackBerry' },
  0x0075: { id: 0x0075, name: 'Samsung' },
  0x00c4: { id: 0x00c4, name: 'LG Electronics' },
  0x00e0: { id: 0x00e0, name: 'Google' },
  0x0131: { id: 0x0131, name: 'GoPro' },
  0x0134: { id: 0x0134, name: 'Tile' },
  0x0157: { id: 0x0157, name: 'Amazon' },
  0x0171: { id: 0x0171, name: 'Xiaomi' },
  0x019a: { id: 0x019a, name: 'Fitbit' },
  0x0204: { id: 0x0204, name: 'Philips' },
  0x022a: { id: 0x022a, name: 'Xiaomi' },
  0x0237: { id: 0x0237, name: 'Samsung' },
  0x0244: { id: 0x0244, name: 'Xiaomi' },
  0x024c: { id: 0x024c, name: 'Xiaomi' },
  0x027a: { id: 0x027a, name: 'Raspberry Pi' },
  0x028b: { id: 0x028b, name: 'Xiaomi' },
  0x029d: { id: 0x029d, name: 'Samsung' },
  0x02a5: { id: 0x02a5, name: 'Xiaomi' },
  0x0310: { id: 0x0310, name: 'Xiaomi' },
  0x0341: { id: 0x0341, name: 'OnePlus' },
  0x0371: { id: 0x0371, name: 'Xiaomi' },
  0x038f: { id: 0x038f, name: 'Xiaomi' },
  0x0397: { id: 0x0397, name: 'Xiaomi' },
  0x03e8: { id: 0x03e8, name: 'Xiaomi' },
  0x0409: { id: 0x0409, name: 'Google' },
  0x0426: { id: 0x0426, name: 'Xiaomi' },
  0x042f: { id: 0x042f, name: 'Xiaomi' },
  0x0471: { id: 0x0471, name: 'Philips' },
  0x0483: { id: 0x0483, name: 'STMicroelectronics' },
  0x0499: { id: 0x0499, name: 'Ruuvi Innovations' },
  0x04b3: { id: 0x04b3, name: 'Xiaomi' },
  0x04c3: { id: 0x04c3, name: 'Xiaomi' },
  0x0547: { id: 0x0547, name: 'Nordic Semiconductor' },
  0x0590: { id: 0x0590, name: 'Xiaomi' },
  0x0638: { id: 0x0638, name: 'Xiaomi' },
  0x067e: { id: 0x067e, name: 'Xiaomi' },
  0x0683: { id: 0x0683, name: 'Xiaomi' },
  0x0694: { id: 0x0694, name: 'Xiaomi' },
  0x06ab: { id: 0x06ab, name: 'Xiaomi' },
  0x0700: { id: 0x0700, name: 'Rohm' },
  0x0765: { id: 0x0765, name: 'Xiaomi' },
  0x0784: { id: 0x0784, name: 'Xiaomi' },
  0x07c5: { id: 0x07c5, name: 'Xiaomi' },
  0x0822: { id: 0x0822, name: 'Xiaomi' },
  0x0826: { id: 0x0826, name: 'Xiaomi' },
  0x0830: { id: 0x0830, name: 'Xiaomi' },
  0x0863: { id: 0x0863, name: 'Xiaomi' },
  0x0895: { id: 0x0895, name: 'Xiaomi' },
  0x08b9: { id: 0x08b9, name: 'Xiaomi' },
  0x0906: { id: 0x0906, name: 'Xiaomi' },
  0x0925: { id: 0x0925, name: 'Xiaomi' },
  0x0941: { id: 0x0941, name: 'Xiaomi' },
  0x0966: { id: 0x0966, name: 'Ring' },
  0x0974: { id: 0x0974, name: 'Xiaomi' },
  0x0996: { id: 0x0996, name: 'Xiaomi' },
  0x09c3: { id: 0x09c3, name: 'Xiaomi' },
  0x0a2a: { id: 0x0a2a, name: 'Xiaomi' },
  0x0a8b: { id: 0x0a8b, name: 'Xiaomi' },
  0x0ad0: { id: 0x0ad0, name: 'Xiaomi' },
  0x0b41: { id: 0x0b41, name: 'Xiaomi' },
  0x0b67: { id: 0x0b67, name: 'Xiaomi' },
  0x0b75: { id: 0x0b75, name: 'Xiaomi' },
  0x0b9c: { id: 0x0b9c, name: 'Xiaomi' },
  0x0bbe: { id: 0x0bbe, name: 'Xiaomi' },
  0x0be2: { id: 0x0be2, name: 'Xiaomi' },
  0x0c1d: { id: 0x0c1d, name: 'Xiaomi' },
  0x0cd4: { id: 0x0cd4, name: 'Xiaomi' },
  0x0d18: { id: 0x0d18, name: 'Xiaomi' },
  0x0d7a: { id: 0x0d7a, name: 'Xiaomi' },
  0x0d98: { id: 0x0d98, name: 'Xiaomi' },
  0x0dd0: { id: 0x0dd0, name: 'Xiaomi' },
  0x0df9: { id: 0x0df9, name: 'Xiaomi' },
  0x0e02: { id: 0x0e02, name: 'Xiaomi' },
  0x0e57: { id: 0x0e57, name: 'Xiaomi' },
  0x0f0c: { id: 0x0f0c, name: 'Xiaomi' },
  0x0f6c: { id: 0x0f6c, name: 'Xiaomi' },
  0x1000: { id: 0x1000, name: 'Sony' },
  0x1017: { id: 0x1017, name: 'Huawei' },
  0x10ae: { id: 0x10ae, name: 'Huawei' },
  0x1111: { id: 0x1111, name: 'Huawei' },
  0x1243: { id: 0x1243, name: 'Huawei' },
  0x127a: { id: 0x127a, name: 'Huawei' },
  0x12d1: { id: 0x12d1, name: 'Huawei' },
  0x147b: { id: 0x147b, name: 'ASUSTek' },
  0x15a2: { id: 0x15a2, name: 'Fingerprint Cards' },
  0x15b3: { id: 0x15b3, name: 'Huawei' },
  0x1689: { id: 0x1689, name: 'Huawei' },
  0x1724: { id: 0x1724, name: 'Huawei' },
  0x1812: { id: 0x1812, name: 'LEGO' },
  0x18d1: { id: 0x18d1, name: 'Google' },
  0x18e8: { id: 0x18e8, name: 'Huawei' },
  0x1d28: { id: 0x1d28, name: 'Huawei' },
  0x1f3a: { id: 0x1f3a, name: 'Huawei' },
  0x2015: { id: 0x2015, name: 'Huawei' },
  0x2205: { id: 0x2205, name: 'Huawei' },
  0x220e: { id: 0x220e, name: 'Huawei' },
  0x239a: { id: 0x239a, name: 'Huawei' },
  0x2409: { id: 0x2409, name: 'Huawei' },
  0x2420: { id: 0x2420, name: 'Huawei' },
  0x2717: { id: 0x2717, name: 'Huawei' },
  0x2908: { id: 0x2908, name: 'Huawei' },
  0x2c1f: { id: 0x2c1f, name: 'Huawei' },
  0x2dc0: { id: 0x2dc0, name: 'Huawei' },
  0x2e5c: { id: 0x2e5c, name: 'Huawei' },
  0x2e8b: { id: 0x2e8b, name: 'Huawei' },
  0x2ec1: { id: 0x2ec1, name: 'Huawei' },
  0x303a: { id: 0x303a, name: 'Huawei' },
  0x33cc: { id: 0x33cc, name: 'Huawei' },
  0x37a3: { id: 0x37a3, name: 'Huawei' },
  0x3a1c: { id: 0x3a1c, name: 'Huawei' },
  0x3a43: { id: 0x3a43, name: 'Huawei' },
  0x3ab9: { id: 0x3ab9, name: 'Huawei' },
  0x3dba: { id: 0x3dba, name: 'Huawei' },
  0x4024: { id: 0x4024, name: 'Samsung' },
  0x4426: { id: 0x4426, name: 'Samsung' },
  0x4c02: { id: 0x4c02, name: 'Samsung' },
  0x4c7c: { id: 0x4c7c, name: 'Samsung' },
  0x4e4c: { id: 0x4e4c, name: 'Samsung' },
  0x4f43: { id: 0x4f43, name: 'Samsung' },
  0x5550: { id: 0x5550, name: 'Samsung' },
  0x5575: { id: 0x5575, name: 'Samsung' },
  0x5617: { id: 0x5617, name: 'Samsung' },
  0x562f: { id: 0x562f, name: 'Samsung' },
  0x5683: { id: 0x5683, name: 'Samsung' },
  0x57f0: { id: 0x57f0, name: 'Samsung' },
  0x58a2: { id: 0x58a2, name: 'Samsung' },
  0x5ac8: { id: 0x5ac8, name: 'Samsung' },
  0x5d6f: { id: 0x5d6f, name: 'Samsung' },
  0x5e57: { id: 0x5e57, name: 'Samsung' },
  0x5f75: { id: 0x5f75, name: 'Samsung' },
  0x62b0: { id: 0x62b0, name: 'Samsung' },
  0x6377: { id: 0x6377, name: 'Samsung' },
  0x6603: { id: 0x6603, name: 'Samsung' },
  0x6699: { id: 0x6699, name: 'Samsung' },
  0x66a1: { id: 0x66a1, name: 'Samsung' },
  0x6850: { id: 0x6850, name: 'Samsung' },
  0x68ab: { id: 0x68ab, name: 'Samsung' },
  0x6c53: { id: 0x6c53, name: 'Samsung' },
  0x6f63: { id: 0x6f63, name: 'Samsung' },
  0x7028: { id: 0x7028, name: 'Samsung' },
  0x72c8: { id: 0x72c8, name: 'Samsung' },
  0x7407: { id: 0x7407, name: 'Samsung' },
  0x7457: { id: 0x7457, name: 'Samsung' },
  0x746a: { id: 0x746a, name: 'Samsung' },
  0x74d2: { id: 0x74d2, name: 'Samsung' },
  0x74e1: { id: 0x74e1, name: 'Samsung' },
  0x7694: { id: 0x7694, name: 'Samsung' },
  0x76ad: { id: 0x76ad, name: 'Samsung' },
  0x77bb: { id: 0x77bb, name: 'Samsung' },
  0x7809: { id: 0x7809, name: 'Samsung' },
  0x78c0: { id: 0x78c0, name: 'Samsung' },
  0x78f0: { id: 0x78f0, name: 'Samsung' },
  0x7a23: { id: 0x7a23, name: 'Samsung' },
  0x7d3c: { id: 0x7d3c, name: 'Samsung' },
  0x7df0: { id: 0x7df0, name: 'Samsung' },
  0x7f25: { id: 0x7f25, name: 'Samsung' },
  0x8000: { id: 0x8000, name: 'Huawei' },
  0x8106: { id: 0x8106, name: 'Huawei' },
  0x8133: { id: 0x8133, name: 'Samsung' },
  0x82a5: { id: 0x82a5, name: 'Samsung' },
  0x82e9: { id: 0x82e9, name: 'Samsung' },
  0x8339: { id: 0x8339, name: 'Samsung' },
  0x841a: { id: 0x841a, name: 'Samsung' },
  0x8479: { id: 0x8479, name: 'Samsung' },
  0x8689: { id: 0x8689, name: 'Samsung' },
  0x8767: { id: 0x8767, name: 'Samsung' },
  0x8888: { id: 0x8888, name: 'Samsung' },
  0x8abf: { id: 0x8abf, name: 'Samsung' },
  0x8b9a: { id: 0x8b9a, name: 'Samsung' },
  0x8c77: { id: 0x8c77, name: 'Samsung' },
  0x8d77: { id: 0x8d77, name: 'Samsung' },
  0x9000: { id: 0x9000, name: 'Huawei' },
  0x9087: { id: 0x9087, name: 'Samsung' },
  0x9188: { id: 0x9188, name: 'Samsung' },
  0x9206: { id: 0x9206, name: 'Samsung' },
  0x931c: { id: 0x931c, name: 'Samsung' },
  0x9380: { id: 0x9380, name: 'Samsung' },
  0x9609: { id: 0x9609, name: 'Samsung' },
  0x9a53: { id: 0x9a53, name: 'Samsung' },
  0x9af3: { id: 0x9af3, name: 'Samsung' },
  0x9b3c: { id: 0x9b3c, name: 'Samsung' },
  0x9d3a: { id: 0x9d3a, name: 'Samsung' },
  0x9e69: { id: 0x9e69, name: 'Samsung' },
  0x9f40: { id: 0x9f40, name: 'Samsung' },
  0xa046: { id: 0xa046, name: 'Samsung' },
  0xa4bb: { id: 0xa4bb, name: 'Samsung' },
  0xa54f: { id: 0xa54f, name: 'Samsung' },
  0xa7bb: { id: 0xa7bb, name: 'Samsung' },
  0xa894: { id: 0xa894, name: 'Samsung' },
  0xab32: { id: 0xab32, name: 'Samsung' },
  0xab5c: { id: 0xab5c, name: 'Samsung' },
  0xac12: { id: 0xac12, name: 'Samsung' },
  0xac3c: { id: 0xac3c, name: 'Samsung' },
  0xad7f: { id: 0xad7f, name: 'Samsung' },
  0xae4d: { id: 0xae4d, name: 'Samsung' },
  0xaf77: { id: 0xaf77, name: 'Samsung' },
  0xb002: { id: 0xb002, name: 'Samsung' },
  0xb4b0: { id: 0xb4b0, name: 'Samsung' },
  0xb8f1: { id: 0xb8f1, name: 'Samsung' },
  0xba94: { id: 0xba94, name: 'Samsung' },
  0xbb32: { id: 0xbb32, name: 'Samsung' },
  0xbb4f: { id: 0xbb4f, name: 'Samsung' },
  0xbb94: { id: 0xbb94, name: 'Samsung' },
  0xbc14: { id: 0xbc14, name: 'Samsung' },
  0xbe7a: { id: 0xbe7a, name: 'Samsung' },
  0xc5c3: { id: 0xc5c3, name: 'Samsung' },
  0xc5c5: { id: 0xc5c5, name: 'Samsung' },
  0xc9a2: { id: 0xc9a2, name: 'Samsung' },
  0xca94: { id: 0xca94, name: 'Samsung' },
  0xcc70: { id: 0xcc70, name: 'Samsung' },
  0xcd86: { id: 0xcd86, name: 'Samsung' },
  0xd2bf: { id: 0xd2bf, name: 'Samsung' },
  0xd4b9: { id: 0xd4b9, name: 'Samsung' },
  0xd888: { id: 0xd888, name: 'Huawei' },
  0xdc65: { id: 0xdc65, name: 'Samsung' },
  0xe4ca: { id: 0xe4ca, name: 'Samsung' },
  0xe56a: { id: 0xe56a, name: 'Samsung' },
  0xe6d9: { id: 0xe6d9, name: 'Samsung' },
  0xe8ab: { id: 0xe8ab, name: 'Samsung' },
  0xeb11: { id: 0xeb11, name: 'Samsung' },
  0xec7d: { id: 0xec7d, name: 'Samsung' },
  0xef73: { id: 0xef73, name: 'Huawei' },
  0xf218: { id: 0xf218, name: 'Samsung' },
  0xf438: { id: 0xf438, name: 'Samsung' },
  0xf54f: { id: 0xf54f, name: 'Samsung' },
  0xf5f9: { id: 0xf5f9, name: 'Samsung' },
  0xf7e6: { id: 0xf7e6, name: 'Huawei' },
  0xfa64: { id: 0xfa64, name: 'Samsung' },
  0xfb4f: { id: 0xfb4f, name: 'Samsung' },
  0xfc1c: { id: 0xfc1c, name: 'Samsung' },
  0xfde9: { id: 0xfde9, name: 'Samsung' },
  0xff02: { id: 0xff02, name: 'Google/Nest' },
};

export const DEVICE_PATTERNS: DevicePattern[] = [
  {
    pattern: /AirTag/i,
    name: 'AirTag',
    type: 'Tracker',
    category: 'IoT',
    manufacturer: 'Apple',
  },
  {
    pattern: /Find\s*My/i,
    name: 'Find My Tracker',
    type: 'Tracker',
    category: 'IoT',
    manufacturer: 'Apple',
  },
  {
    pattern: /Chipolo/i,
    name: 'Chipolo',
    type: 'Tracker',
    category: 'IoT',
    manufacturer: 'Chipolo',
  },
  {
    pattern: /Pebblebee/i,
    name: 'Pebblebee',
    type: 'Tracker',
    category: 'IoT',
    manufacturer: 'Pebblebee',
  },
  {
    pattern: /Moto Tag/i,
    name: 'Moto Tag',
    type: 'Tracker',
    category: 'IoT',
    manufacturer: 'Motorola',
  },
  {
    pattern: /JioTag/i,
    name: 'JioTag',
    type: 'Tracker',
    category: 'IoT',
    manufacturer: 'Jio',
  },
  {
    pattern: /Galaxy SmartTag2/i,
    name: 'Galaxy SmartTag2',
    type: 'Tracker',
    category: 'IoT',
    manufacturer: 'Samsung',
  },
  {
    pattern: /CMF Buds/i,
    name: 'CMF Buds',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Nothing',
  },
  {
    pattern: /Nothing Ear/i,
    name: 'Nothing Ear',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Nothing',
  },
  {
    pattern: /Nothing Buds/i,
    name: 'Nothing Buds',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Nothing',
  },
  {
    pattern: /OnePlus Buds/i,
    name: 'OnePlus Buds',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'OnePlus',
  },
  {
    pattern: /Nord Buds/i,
    name: 'OnePlus Nord Buds',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'OnePlus',
  },
  {
    pattern: /LinkBuds/i,
    name: 'Sony LinkBuds',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Sony',
  },
  {
    pattern: /WF-1000XM/i,
    name: 'Sony WF-1000XM',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Sony',
  },
  {
    pattern: /WH-1000XM/i,
    name: 'Sony WH-1000XM',
    type: 'Headphones',
    category: 'Audio',
    manufacturer: 'Sony',
  },
  {
    pattern: /Bose QuietComfort/i,
    name: 'Bose QuietComfort',
    type: 'Headphones',
    category: 'Audio',
    manufacturer: 'Bose',
  },
  {
    pattern: /QC Earbuds/i,
    name: 'Bose QC Earbuds',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Bose',
  },
  {
    pattern: /Marshall Motif/i,
    name: 'Marshall Motif',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Marshall',
  },
  {
    pattern: /Marshall Major/i,
    name: 'Marshall Major',
    type: 'Headphones',
    category: 'Audio',
    manufacturer: 'Marshall',
  },
  {
    pattern: /Skullcandy/i,
    name: 'Skullcandy',
    type: 'Audio Device',
    category: 'Audio',
    manufacturer: 'Skullcandy',
  },
  {
    pattern: /TOZO/i,
    name: 'TOZO',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'TOZO',
  },
  {
    pattern: /Baseus/i,
    name: 'Baseus',
    type: 'Audio Device',
    category: 'Audio',
    manufacturer: 'Baseus',
  },
  {
    pattern: /UGREEN/i,
    name: 'UGREEN',
    type: 'Audio Device',
    category: 'Audio',
    manufacturer: 'UGREEN',
  },
  {
    pattern: /Honor Earbuds/i,
    name: 'Honor Earbuds',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Honor',
  },
  {
    pattern: /Honor Choice/i,
    name: 'Honor Choice',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Honor',
  },
  {
    pattern: /Redmi Buds/i,
    name: 'Redmi Buds',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Xiaomi Buds/i,
    name: 'Xiaomi Buds',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /FreeBuds/i,
    name: 'Huawei FreeBuds',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Huawei',
  },
  {
    pattern: /Watch Fit/i,
    name: 'Huawei Watch Fit',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Huawei',
  },
  {
    pattern: /AirPods/i,
    name: 'AirPods',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Apple',
  },
  {
    pattern: /AirPods Pro/i,
    name: 'AirPods Pro',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Apple',
  },
  {
    pattern: /AirPods Max/i,
    name: 'AirPods Max',
    type: 'Headphones',
    category: 'Audio',
    manufacturer: 'Apple',
  },
  {
    pattern: /Beats/i,
    name: 'Beats',
    type: 'Headphones',
    category: 'Audio',
    manufacturer: 'Apple',
  },
  {
    pattern: /Powerbeats/i,
    name: 'Powerbeats',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Apple',
  },
  {
    pattern: /Powerbeats Pro/i,
    name: 'Powerbeats Pro',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Apple',
  },
  {
    pattern: /Beats Studio/i,
    name: 'Beats Studio',
    type: 'Headphones',
    category: 'Audio',
    manufacturer: 'Apple',
  },
  {
    pattern: /Beats Fit Pro/i,
    name: 'Beats Fit Pro',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Apple',
  },
  {
    pattern: /Galaxy Buds/i,
    name: 'Galaxy Buds',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Samsung',
  },
  {
    pattern: /Galaxy Buds2/i,
    name: 'Galaxy Buds2',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Samsung',
  },
  {
    pattern: /Galaxy Buds Pro/i,
    name: 'Galaxy Buds Pro',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Samsung',
  },
  {
    pattern: /Galaxy Buds Live/i,
    name: 'Galaxy Buds Live',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Samsung',
  },
  {
    pattern: /Galaxy Buds FE/i,
    name: 'Galaxy Buds FE',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Samsung',
  },
  {
    pattern: /Gear IconX/i,
    name: 'Gear IconX',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Samsung',
  },
  {
    pattern: /Galaxy Watch/i,
    name: 'Galaxy Watch',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Samsung',
  },
  {
    pattern: /Galaxy Fit/i,
    name: 'Galaxy Fit',
    type: 'Fitness Tracker',
    category: 'Wearables',
    manufacturer: 'Samsung',
  },
  {
    pattern: /Galaxy Active/i,
    name: 'Galaxy Watch Active',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Samsung',
  },
  {
    pattern: /Galaxy Active2/i,
    name: 'Galaxy Watch Active2',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Samsung',
  },
  {
    pattern: /Gear S/i,
    name: 'Gear S',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Samsung',
  },
  {
    pattern: /Gear Fit/i,
    name: 'Gear Fit',
    type: 'Fitness Tracker',
    category: 'Wearables',
    manufacturer: 'Samsung',
  },
  {
    pattern: /Samsung Watch/i,
    name: 'Samsung Watch',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Samsung',
  },
  {
    pattern: /Mi Band/i,
    name: 'Mi Band',
    type: 'Fitness Tracker',
    category: 'Wearables',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Amazfit Band/i,
    name: 'Amazfit Band',
    type: 'Fitness Tracker',
    category: 'Wearables',
    manufacturer: 'Huami',
  },
  {
    pattern: /Amazfit GTS/i,
    name: 'Amazfit GTS',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Huami',
  },
  {
    pattern: /Amazfit GTR/i,
    name: 'Amazfit GTR',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Huami',
  },
  {
    pattern: /Amazfit Stratos/i,
    name: 'Amazfit Stratos',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Huami',
  },
  {
    pattern: /Amazfit T-Rex/i,
    name: 'Amazfit T-Rex',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Huami',
  },
  {
    pattern: /Amazfit Bip/i,
    name: 'Amazfit Bip',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Huami',
  },
  {
    pattern: /Xiaomi Watch/i,
    name: 'Xiaomi Watch',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Xiaomi Band/i,
    name: 'Xiaomi Band',
    type: 'Fitness Tracker',
    category: 'Wearables',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Haylou/i,
    name: 'Haylou',
    type: 'Fitness Tracker',
    category: 'Wearables',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Fitbit Alta/i,
    name: 'Fitbit Alta',
    type: 'Fitness Tracker',
    category: 'Wearables',
    manufacturer: 'Fitbit',
  },
  {
    pattern: /Fitbit Charge/i,
    name: 'Fitbit Charge',
    type: 'Fitness Tracker',
    category: 'Wearables',
    manufacturer: 'Fitbit',
  },
  {
    pattern: /Fitbit Flex/i,
    name: 'Fitbit Flex',
    type: 'Fitness Tracker',
    category: 'Wearables',
    manufacturer: 'Fitbit',
  },
  {
    pattern: /Fitbit Ionic/i,
    name: 'Fitbit Ionic',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Fitbit',
  },
  {
    pattern: /Fitbit Sense/i,
    name: 'Fitbit Sense',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Fitbit',
  },
  {
    pattern: /Fitbit Versa/i,
    name: 'Fitbit Versa',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Fitbit',
  },
  {
    pattern: /Fitbit Inspire/i,
    name: 'Fitbit Inspire',
    type: 'Fitness Tracker',
    category: 'Wearables',
    manufacturer: 'Fitbit',
  },
  {
    pattern: /Fitbit Ace/i,
    name: 'Fitbit Ace',
    type: 'Fitness Tracker',
    category: 'Wearables',
    manufacturer: 'Fitbit',
  },
  {
    pattern: /Garmin.*Vivo/i,
    name: 'Garmin Vivo',
    type: 'Fitness Tracker',
    category: 'Wearables',
    manufacturer: 'Garmin',
  },
  {
    pattern: /Garmin.*Forerunner/i,
    name: 'Garmin Forerunner',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Garmin',
  },
  {
    pattern: /Garmin.*Fenix/i,
    name: 'Garmin Fenix',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Garmin',
  },
  {
    pattern: /Garmin.*Venu/i,
    name: 'Garmin Venu',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Garmin',
  },
  {
    pattern: /Polar Vantage/i,
    name: 'Polar Vantage',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Polar',
  },
  {
    pattern: /Polar Grit/i,
    name: 'Polar Grit',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Polar',
  },
  {
    pattern: /Polar Unite/i,
    name: 'Polar Unite',
    type: 'Fitness Tracker',
    category: 'Wearables',
    manufacturer: 'Polar',
  },
  {
    pattern: /Apple Watch/i,
    name: 'Apple Watch',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Apple',
  },
  {
    pattern: /Watch Ultra/i,
    name: 'Apple Watch Ultra',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Apple',
  },
  {
    pattern: /Tile Mate/i,
    name: 'Tile Mate',
    type: 'Tracker',
    category: 'IoT',
    manufacturer: 'Tile',
  },
  {
    pattern: /Tile Slim/i,
    name: 'Tile Slim',
    type: 'Tracker',
    category: 'IoT',
    manufacturer: 'Tile',
  },
  {
    pattern: /Tile Sticker/i,
    name: 'Tile Sticker',
    type: 'Tracker',
    category: 'IoT',
    manufacturer: 'Tile',
  },
  {
    pattern: /Tile Pro/i,
    name: 'Tile Pro',
    type: 'Tracker',
    category: 'IoT',
    manufacturer: 'Tile',
  },
  {
    pattern: /Samsung SmartTag/i,
    name: 'Samsung SmartTag',
    type: 'Tracker',
    category: 'IoT',
    manufacturer: 'Samsung',
  },
  {
    pattern: /Galaxy SmartTag/i,
    name: 'Galaxy SmartTag',
    type: 'Tracker',
    category: 'IoT',
    manufacturer: 'Samsung',
  },
  {
    pattern: /SmartThings/i,
    name: 'SmartThings',
    type: 'Hub',
    category: 'IoT',
    manufacturer: 'Samsung',
  },
  {
    pattern: /Nest Hub/i,
    name: 'Nest Hub',
    type: 'Smart Speaker',
    category: 'IoT',
    manufacturer: 'Google',
  },
  {
    pattern: /Nest Mini/i,
    name: 'Nest Mini',
    type: 'Smart Speaker',
    category: 'IoT',
    manufacturer: 'Google',
  },
  {
    pattern: /Nest Audio/i,
    name: 'Nest Audio',
    type: 'Smart Speaker',
    category: 'IoT',
    manufacturer: 'Google',
  },
  {
    pattern: /Google Home/i,
    name: 'Google Home',
    type: 'Smart Speaker',
    category: 'IoT',
    manufacturer: 'Google',
  },
  {
    pattern: /Chromecast/i,
    name: 'Chromecast',
    type: 'Streaming',
    category: 'IoT',
    manufacturer: 'Google',
  },
  {
    pattern: /Echo Dot/i,
    name: 'Echo Dot',
    type: 'Smart Speaker',
    category: 'IoT',
    manufacturer: 'Amazon',
  },
  {
    pattern: /Echo Show/i,
    name: 'Echo Show',
    type: 'Smart Display',
    category: 'IoT',
    manufacturer: 'Amazon',
  },
  {
    pattern: /Echo Buds/i,
    name: 'Echo Buds',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Amazon',
  },
  {
    pattern: /Echo Flex/i,
    name: 'Echo Flex',
    type: 'Smart Speaker',
    category: 'IoT',
    manufacturer: 'Amazon',
  },
  {
    pattern: /Echo Studio/i,
    name: 'Echo Studio',
    type: 'Smart Speaker',
    category: 'IoT',
    manufacturer: 'Amazon',
  },
  {
    pattern: /Echo (?![\w])/i,
    name: 'Echo',
    type: 'Smart Speaker',
    category: 'IoT',
    manufacturer: 'Amazon',
  },
  {
    pattern: /Kindle/i,
    name: 'Kindle',
    type: 'E-Reader',
    category: 'Computing',
    manufacturer: 'Amazon',
  },
  {
    pattern: /Kindle Paperwhite/i,
    name: 'Kindle Paperwhite',
    type: 'E-Reader',
    category: 'Computing',
    manufacturer: 'Amazon',
  },
  {
    pattern: /Kindle Oasis/i,
    name: 'Kindle Oasis',
    type: 'E-Reader',
    category: 'Computing',
    manufacturer: 'Amazon',
  },
  {
    pattern: /Ring (?!App)/i,
    name: 'Ring',
    type: 'Doorbell',
    category: 'IoT',
    manufacturer: 'Ring',
  },
  {
    pattern: /Ring Chime/i,
    name: 'Ring Chime',
    type: 'Chime',
    category: 'IoT',
    manufacturer: 'Ring',
  },
  {
    pattern: /Nest Doorbell/i,
    name: 'Nest Doorbell',
    type: 'Doorbell',
    category: 'IoT',
    manufacturer: 'Google',
  },
  {
    pattern: /Nest Cam/i,
    name: 'Nest Cam',
    type: 'Camera',
    category: 'IoT',
    manufacturer: 'Google',
  },
  {
    pattern: /Nest Thermostat/i,
    name: 'Nest Thermostat',
    type: 'Thermostat',
    category: 'IoT',
    manufacturer: 'Google',
  },
  {
    pattern: /Nest Protect/i,
    name: 'Nest Protect',
    type: 'Smoke Detector',
    category: 'IoT',
    manufacturer: 'Google',
  },
  {
    pattern: /Nest Connect/i,
    name: 'Nest Connect',
    type: 'Hub',
    category: 'IoT',
    manufacturer: 'Google',
  },
  {
    pattern: /Nest Guard/i,
    name: 'Nest Guard',
    type: 'Hub',
    category: 'IoT',
    manufacturer: 'Google',
  },
  {
    pattern: /Nest Tag/i,
    name: 'Nest Tag',
    type: 'Key fob',
    category: 'IoT',
    manufacturer: 'Google',
  },
  {
    pattern: /Ring Alarm/i,
    name: 'Ring Alarm',
    type: 'Security System',
    category: 'IoT',
    manufacturer: 'Ring',
  },
  {
    pattern: /Ring Video/i,
    name: 'Ring Video',
    type: 'Doorbell',
    category: 'IoT',
    manufacturer: 'Ring',
  },
  {
    pattern: /August Lock/i,
    name: 'August Lock',
    type: 'Smart Lock',
    category: 'IoT',
    manufacturer: 'August',
  },
  {
    pattern: /August Doorbell/i,
    name: 'August Doorbell Cam',
    type: 'Doorbell',
    category: 'IoT',
    manufacturer: 'August',
  },
  {
    pattern: /Schlage Lock/i,
    name: 'Schlage Lock',
    type: 'Smart Lock',
    category: 'IoT',
    manufacturer: 'Schlage',
  },
  {
    pattern: /Yale Lock/i,
    name: 'Yale Lock',
    type: 'Smart Lock',
    category: 'IoT',
    manufacturer: 'Yale',
  },
  {
    pattern: /Philips Hue/i,
    name: 'Philips Hue',
    type: 'Smart Bulb',
    category: 'IoT',
    manufacturer: 'Philips',
  },
  { pattern: /LIFX/i, name: 'LIFX', type: 'Smart Bulb', category: 'IoT', manufacturer: 'LIFX' },
  { pattern: /Wyze Cam/i, name: 'Wyze Cam', type: 'Camera', category: 'IoT', manufacturer: 'Wyze' },
  { pattern: /Wyze/i, name: 'Wyze', type: 'Various', category: 'IoT', manufacturer: 'Wyze' },
  { pattern: /Eufy/i, name: 'Eufy', type: 'Various', category: 'IoT', manufacturer: 'Eufy' },
  { pattern: /Anker/i, name: 'Anker', type: 'Various', category: 'IoT', manufacturer: 'Anker' },
  {
    pattern: /TP-Link/i,
    name: 'TP-Link',
    type: 'Smart Plug',
    category: 'IoT',
    manufacturer: 'TP-Link',
  },
  {
    pattern: /Kasa/i,
    name: 'Kasa Smart',
    type: 'Smart Plug',
    category: 'IoT',
    manufacturer: 'TP-Link',
  },
  {
    pattern: /SwitchBot/i,
    name: 'SwitchBot',
    type: 'Bot',
    category: 'IoT',
    manufacturer: 'SwitchBot',
  },
  { pattern: /iRobot/i, name: 'iRobot', type: 'Vacuum', category: 'IoT', manufacturer: 'iRobot' },
  { pattern: /Roomba/i, name: 'Roomba', type: 'Vacuum', category: 'IoT', manufacturer: 'iRobot' },
  {
    pattern: /Ecovacs/i,
    name: 'Ecovacs',
    type: 'Vacuum',
    category: 'IoT',
    manufacturer: 'Ecovacs',
  },
  {
    pattern: /Dyson/i,
    name: 'Dyson',
    type: 'Vacuum/Purifier',
    category: 'IoT',
    manufacturer: 'Dyson',
  },
  {
    pattern: /Switchbot/i,
    name: 'SwitchBot',
    type: 'Bot',
    category: 'IoT',
    manufacturer: 'SwitchBot',
  },
  {
    pattern: /Govee/i,
    name: 'Govee',
    type: 'Smart Lights',
    category: 'IoT',
    manufacturer: 'Govee',
  },
  {
    pattern: /Nanoleaf/i,
    name: 'Nanoleaf',
    type: 'Smart Lights',
    category: 'IoT',
    manufacturer: 'Nanoleaf',
  },
  {
    pattern: /Hue Sync/i,
    name: 'Hue Sync',
    type: 'Sync Box',
    category: 'IoT',
    manufacturer: 'Philips',
  },
  { pattern: /Sonos/i, name: 'Sonos', type: 'Speaker', category: 'Audio', manufacturer: 'Sonos' },
  {
    pattern: /Bose (?!Music)/i,
    name: 'Bose',
    type: 'Speaker',
    category: 'Audio',
    manufacturer: 'Bose',
  },
  {
    pattern: /Bose SoundTouch/i,
    name: 'Bose SoundTouch',
    type: 'Speaker',
    category: 'Audio',
    manufacturer: 'Bose',
  },
  {
    pattern: /Bose Portable/i,
    name: 'Bose Portable',
    type: 'Speaker',
    category: 'Audio',
    manufacturer: 'Bose',
  },
  {
    pattern: /JBL (?!Music)/i,
    name: 'JBL',
    type: 'Speaker',
    category: 'Audio',
    manufacturer: 'JBL',
  },
  {
    pattern: /JBL Flip/i,
    name: 'JBL Flip',
    type: 'Speaker',
    category: 'Audio',
    manufacturer: 'JBL',
  },
  {
    pattern: /JBL Charge/i,
    name: 'JBL Charge',
    type: 'Speaker',
    category: 'Audio',
    manufacturer: 'JBL',
  },
  {
    pattern: /UE Boom/i,
    name: 'UE Boom',
    type: 'Speaker',
    category: 'Audio',
    manufacturer: 'Ultimate Ears',
  },
  {
    pattern: /UE Wonderboom/i,
    name: 'UE Wonderboom',
    type: 'Speaker',
    category: 'Audio',
    manufacturer: 'Ultimate Ears',
  },
  {
    pattern: /Sennheiser/i,
    name: 'Sennheiser',
    type: 'Headphones',
    category: 'Audio',
    manufacturer: 'Sennheiser',
  },
  {
    pattern: /Sony WH/i,
    name: 'Sony WH',
    type: 'Headphones',
    category: 'Audio',
    manufacturer: 'Sony',
  },
  {
    pattern: /Sony WF/i,
    name: 'Sony WF',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Sony',
  },
  {
    pattern: /Sony WI/i,
    name: 'Sony WI',
    type: 'Neckband',
    category: 'Audio',
    manufacturer: 'Sony',
  },
  {
    pattern: /Sony SRS/i,
    name: 'Sony SRS',
    type: 'Speaker',
    category: 'Audio',
    manufacturer: 'Sony',
  },
  {
    pattern: /XBALANCE/i,
    name: 'Sony XBALANCE',
    type: 'Speaker',
    category: 'Audio',
    manufacturer: 'Sony',
  },
  { pattern: /LG (?!TV)/i, name: 'LG', type: 'Various', category: 'IoT', manufacturer: 'LG' },
  {
    pattern: /LG OLED/i,
    name: 'LG OLED',
    type: 'TV',
    category: 'Entertainment',
    manufacturer: 'LG',
  },
  { pattern: /Roku/i, name: 'Roku', type: 'Streaming', category: 'IoT', manufacturer: 'Roku' },
  {
    pattern: /Fire TV/i,
    name: 'Fire TV',
    type: 'Streaming',
    category: 'IoT',
    manufacturer: 'Amazon',
  },
  {
    pattern: /FireTV/i,
    name: 'Fire TV',
    type: 'Streaming',
    category: 'IoT',
    manufacturer: 'Amazon',
  },
  {
    pattern: /Apple TV/i,
    name: 'Apple TV',
    type: 'Streaming',
    category: 'Entertainment',
    manufacturer: 'Apple',
  },
  {
    pattern: /SHIELD/i,
    name: 'NVIDIA SHIELD',
    type: 'Streaming',
    category: 'Entertainment',
    manufacturer: 'NVIDIA',
  },
  { pattern: /Xbox/i, name: 'Xbox', type: 'Gaming', category: 'Gaming', manufacturer: 'Microsoft' },
  {
    pattern: /PlayStation/i,
    name: 'PlayStation',
    type: 'Gaming',
    category: 'Gaming',
    manufacturer: 'Sony',
  },
  {
    pattern: /Nintendo/i,
    name: 'Nintendo',
    type: 'Gaming',
    category: 'Gaming',
    manufacturer: 'Nintendo',
  },
  {
    pattern: /Switch Pro/i,
    name: 'Switch Pro Controller',
    type: 'Controller',
    category: 'Gaming',
    manufacturer: 'Nintendo',
  },
  {
    pattern: /DualSense/i,
    name: 'DualSense',
    type: 'Controller',
    category: 'Gaming',
    manufacturer: 'Sony',
  },
  {
    pattern: /DualShock/i,
    name: 'DualShock',
    type: 'Controller',
    category: 'Gaming',
    manufacturer: 'Sony',
  },
  {
    pattern: /Xbox Elite/i,
    name: 'Xbox Elite',
    type: 'Controller',
    category: 'Gaming',
    manufacturer: 'Microsoft',
  },
  {
    pattern: /Xbox Adaptive/i,
    name: 'Xbox Adaptive',
    type: 'Controller',
    category: 'Gaming',
    manufacturer: 'Microsoft',
  },
  { pattern: /Steam/i, name: 'Steam', type: 'Gaming', category: 'Gaming', manufacturer: 'Valve' },
  {
    pattern: /Logitech (?!G)/i,
    name: 'Logitech',
    type: 'Various',
    category: 'Computing',
    manufacturer: 'Logitech',
  },
  {
    pattern: /Logitech G/i,
    name: 'Logitech G',
    type: 'Gaming',
    category: 'Computing',
    manufacturer: 'Logitech',
  },
  {
    pattern: /MX Keys/i,
    name: 'Logitech MX Keys',
    type: 'Keyboard',
    category: 'Computing',
    manufacturer: 'Logitech',
  },
  {
    pattern: /MX Master/i,
    name: 'Logitech MX Master',
    type: 'Mouse',
    category: 'Computing',
    manufacturer: 'Logitech',
  },
  {
    pattern: /Jaybird/i,
    name: 'Jaybird',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Logitech',
  },
  {
    pattern: /Plantronics/i,
    name: 'Plantronics',
    type: 'Headset',
    category: 'Audio',
    manufacturer: 'Poly',
  },
  {
    pattern: /Poly (?!com)/i,
    name: 'Poly',
    type: 'Headset',
    category: 'Audio',
    manufacturer: 'Poly',
  },
  {
    pattern: /Anker Soundcore/i,
    name: 'Soundcore',
    type: 'Speaker',
    category: 'Audio',
    manufacturer: 'Anker',
  },
  {
    pattern: /Anker Liberty/i,
    name: 'Anker Liberty',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Anker',
  },
  {
    pattern: /EarFun/i,
    name: 'EarFun',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'EarFun',
  },
  { pattern: /Jabra/i, name: 'Jabra', type: 'Headset', category: 'Audio', manufacturer: 'Jabra' },
  {
    pattern: /Jabra Elite/i,
    name: 'Jabra Elite',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Jabra',
  },
  {
    pattern: /SoundPEATS/i,
    name: 'SoundPEATS',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'SoundPEATS',
  },
  { pattern: /QCY/i, name: 'QCY', type: 'Earbuds', category: 'Audio', manufacturer: 'QCY' },
  {
    pattern: /Fossil/i,
    name: 'Fossil',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Fossil',
  },
  {
    pattern: /TicWatch/i,
    name: 'TicWatch',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Mobvoi',
  },
  {
    pattern: /TicPods/i,
    name: 'TicPods',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Mobvoi',
  },
  {
    pattern: /Huawei Watch/i,
    name: 'Huawei Watch',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Huawei',
  },
  {
    pattern: /Huawei Band/i,
    name: 'Huawei Band',
    type: 'Fitness Tracker',
    category: 'Wearables',
    manufacturer: 'Huawei',
  },
  {
    pattern: /Huawei Free/i,
    name: 'Huawei Free',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Huawei',
  },
  {
    pattern: /Honor Watch/i,
    name: 'Honor Watch',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Honor',
  },
  {
    pattern: /Honor Band/i,
    name: 'Honor Band',
    type: 'Fitness Tracker',
    category: 'Wearables',
    manufacturer: 'Honor',
  },
  {
    pattern: /Oppo Watch/i,
    name: 'Oppo Watch',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Oppo',
  },
  {
    pattern: /Oppo Band/i,
    name: 'Oppo Band',
    type: 'Fitness Tracker',
    category: 'Wearables',
    manufacturer: 'Oppo',
  },
  {
    pattern: /Oppo Enco/i,
    name: 'Oppo Enco',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Oppo',
  },
  {
    pattern: /OnePlus Watch/i,
    name: 'OnePlus Watch',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'OnePlus',
  },
  {
    pattern: /OnePlus Band/i,
    name: 'OnePlus Band',
    type: 'Fitness Tracker',
    category: 'Wearables',
    manufacturer: 'OnePlus',
  },
  {
    pattern: /Realme Watch/i,
    name: 'Realme Watch',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Realme',
  },
  {
    pattern: /Realme Band/i,
    name: 'Realme Band',
    type: 'Fitness Tracker',
    category: 'Wearables',
    manufacturer: 'Realme',
  },
  {
    pattern: /Realme Buds/i,
    name: 'Realme Buds',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Realme',
  },
  {
    pattern: /Vivo Watch/i,
    name: 'Vivo Watch',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Vivo',
  },
  {
    pattern: /Vivo TWS/i,
    name: 'Vivo TWS',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Vivo',
  },
  {
    pattern: /Xiaomi Mijia/i,
    name: 'Xiaomi Mijia',
    type: 'IoT',
    category: 'IoT',
    manufacturer: 'Xiaomi',
  },
  { pattern: /Mi Smart/i, name: 'Mi Smart', type: 'IoT', category: 'IoT', manufacturer: 'Xiaomi' },
  { pattern: /Mi Home/i, name: 'Mi Home', type: 'Hub', category: 'IoT', manufacturer: 'Xiaomi' },
  { pattern: /Aqara/i, name: 'Aqara', type: 'IoT', category: 'IoT', manufacturer: 'Xiaomi' },
  {
    pattern: /Mi Vacuum/i,
    name: 'Mi Vacuum',
    type: 'Vacuum',
    category: 'IoT',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Roborock/i,
    name: 'Roborock',
    type: 'Vacuum',
    category: 'IoT',
    manufacturer: 'Xiaomi',
  },
  { pattern: /Dreame/i, name: 'Dreame', type: 'Vacuum', category: 'IoT', manufacturer: 'Xiaomi' },
  {
    pattern: /Mi Robot/i,
    name: 'Mi Robot',
    type: 'Vacuum',
    category: 'IoT',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Mi Air Purifier/i,
    name: 'Mi Air Purifier',
    type: 'Purifier',
    category: 'IoT',
    manufacturer: 'Xiaomi',
  },
  { pattern: /Mi Air/i, name: 'Mi Air', type: 'Purifier', category: 'IoT', manufacturer: 'Xiaomi' },
  {
    pattern: /Mi Desk Lamp/i,
    name: 'Mi Desk Lamp',
    type: 'Lamp',
    category: 'IoT',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Mi Bedside/i,
    name: 'Mi Bedside Lamp',
    type: 'Lamp',
    category: 'IoT',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Mi Smart Fan/i,
    name: 'Mi Smart Fan',
    type: 'Fan',
    category: 'IoT',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Mi Electric/i,
    name: 'Mi Electric',
    type: 'Appliance',
    category: 'IoT',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Mi Rice/i,
    name: 'Mi Rice Cooker',
    type: 'Appliance',
    category: 'IoT',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Mi Kettle/i,
    name: 'Mi Kettle',
    type: 'Appliance',
    category: 'IoT',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Mi Humidifier/i,
    name: 'Mi Humidifier',
    type: 'Humidifier',
    category: 'IoT',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Mi Heater/i,
    name: 'Mi Heater',
    type: 'Heater',
    category: 'IoT',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Mi Air Conditioner/i,
    name: 'Mi Air Conditioner',
    type: 'AC',
    category: 'IoT',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Mi TV/i,
    name: 'Mi TV',
    type: 'TV',
    category: 'Entertainment',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Mi Box/i,
    name: 'Mi Box',
    type: 'Streaming',
    category: 'IoT',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Mi Projector/i,
    name: 'Mi Projector',
    type: 'Projector',
    category: 'Entertainment',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Mi Laser/i,
    name: 'Mi Laser',
    type: 'Projector',
    category: 'Entertainment',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Mi Portable/i,
    name: 'Mi Portable',
    type: 'Speaker',
    category: 'Audio',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Mi Speaker/i,
    name: 'Mi Speaker',
    type: 'Speaker',
    category: 'Audio',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Mi True/i,
    name: 'Mi True',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Redmi Earbuds/i,
    name: 'Redmi Earbuds',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Redmi Watch/i,
    name: 'Redmi Watch',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Redmi Band/i,
    name: 'Redmi Band',
    type: 'Fitness Tracker',
    category: 'Wearables',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /POCO Watch/i,
    name: 'POCO Watch',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /POCO Band/i,
    name: 'POCO Band',
    type: 'Fitness Tracker',
    category: 'Wearables',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Oura/i,
    name: 'Oura Ring',
    type: 'Ring',
    category: 'Wearables',
    manufacturer: 'Oura',
  },
  { pattern: /Whoop/i, name: 'Whoop', type: 'Band', category: 'Wearables', manufacturer: 'Whoop' },
  {
    pattern: /Withings/i,
    name: 'Withings',
    type: 'Scale/Health',
    category: 'Health',
    manufacturer: 'Withings',
  },
  {
    pattern: /iHealth/i,
    name: 'iHealth',
    type: 'Health Device',
    category: 'Health',
    manufacturer: 'iHealth',
  },
  {
    pattern: /Qardio/i,
    name: 'Qardio',
    type: 'Health Device',
    category: 'Health',
    manufacturer: 'Qardio',
  },
  {
    pattern: /Omron/i,
    name: 'Omron',
    type: 'Health Device',
    category: 'Health',
    manufacturer: 'Omron',
  },
  {
    pattern: /徕芬/i,
    name: 'Laifen',
    type: 'Hair Dryer',
    category: 'Appliance',
    manufacturer: 'Laifen',
  },
  {
    pattern: /Laifen/i,
    name: 'Laifen',
    type: 'Hair Dryer',
    category: 'Appliance',
    manufacturer: 'Laifen',
  },
  { pattern: /乐歌/i, name: 'Loctek', type: 'Desk', category: 'Furniture', manufacturer: 'Loctek' },
  {
    pattern: /Loctek/i,
    name: 'Loctek',
    type: 'Desk',
    category: 'Furniture',
    manufacturer: 'Loctek',
  },
  {
    pattern: /Ninebot/i,
    name: 'Ninebot',
    type: 'Scooter',
    category: 'Transportation',
    manufacturer: 'Ninebot',
  },
  {
    pattern: /Segway/i,
    name: 'Segway',
    type: 'Scooter',
    category: 'Transportation',
    manufacturer: 'Ninebot',
  },
  {
    pattern: /Mi Electric Scooter/i,
    name: 'Mi Electric Scooter',
    type: 'Scooter',
    category: 'Transportation',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /Mi Scooter/i,
    name: 'Mi Scooter',
    type: 'Scooter',
    category: 'Transportation',
    manufacturer: 'Xiaomi',
  },
  {
    pattern: /SwitchBot Hub/i,
    name: 'SwitchBot Hub',
    type: 'Hub',
    category: 'IoT',
    manufacturer: 'SwitchBot',
  },
  {
    pattern: /SwitchBot Meter/i,
    name: 'SwitchBot Meter',
    type: 'Thermometer',
    category: 'IoT',
    manufacturer: 'SwitchBot',
  },
  {
    pattern: /SwitchBot Sensor/i,
    name: 'SwitchBot Sensor',
    type: 'Sensor',
    category: 'IoT',
    manufacturer: 'SwitchBot',
  },
  {
    pattern: /SwitchBot Curtain/i,
    name: 'SwitchBot Curtain',
    type: 'Curtain',
    category: 'IoT',
    manufacturer: 'SwitchBot',
  },
  {
    pattern: /SwitchBot Plug/i,
    name: 'SwitchBot Plug',
    type: 'Plug',
    category: 'IoT',
    manufacturer: 'SwitchBot',
  },
  { pattern: /Ruuvi/i, name: 'RuuviTag', type: 'Beacon', category: 'IoT', manufacturer: 'Ruuvi' },
  { pattern: /ruuvi/i, name: 'RuuviTag', type: 'Beacon', category: 'IoT', manufacturer: 'Ruuvi' },
  {
    pattern: /BLE Keyboard/i,
    name: 'BLE Keyboard',
    type: 'Keyboard',
    category: 'Input',
    manufacturer: 'Generic',
  },
  {
    pattern: /BLE Mouse/i,
    name: 'BLE Mouse',
    type: 'Mouse',
    category: 'Input',
    manufacturer: 'Generic',
  },
  {
    pattern: /BLE Controller/i,
    name: 'BLE Controller',
    type: 'Controller',
    category: 'Input',
    manufacturer: 'Generic',
  },
  {
    pattern: /BLE Gamepad/i,
    name: 'BLE Gamepad',
    type: 'Gamepad',
    category: 'Input',
    manufacturer: 'Generic',
  },
  {
    pattern: /BLE Joystick/i,
    name: 'BLE Joystick',
    type: 'Joystick',
    category: 'Input',
    manufacturer: 'Generic',
  },
  {
    pattern: /ESP32/i,
    name: 'ESP32',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'Espressif',
  },
  {
    pattern: /ESP8266/i,
    name: 'ESP8266',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'Espressif',
  },
  {
    pattern: /Arduino/i,
    name: 'Arduino',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'Arduino',
  },
  {
    pattern: /BBC micro/i,
    name: 'BBC micro:bit',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'BBC',
  },
  {
    pattern: /micro:bit/i,
    name: 'BBC micro:bit',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'BBC',
  },
  { pattern: /Seeed/i, name: 'Seeed', type: 'Dev Board', category: 'IoT', manufacturer: 'Seeed' },
  {
    pattern: /Particle/i,
    name: 'Particle',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'Particle',
  },
  {
    pattern: /Photon/i,
    name: 'Particle Photon',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'Particle',
  },
  {
    pattern: /Argon/i,
    name: 'Particle Argon',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'Particle',
  },
  {
    pattern: /Boron/i,
    name: 'Particle Boron',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'Particle',
  },
  {
    pattern: /Xbox (?!One)/i,
    name: 'Xbox',
    type: 'Gaming',
    category: 'Gaming',
    manufacturer: 'Microsoft',
  },
  {
    pattern: /XboxSeries/i,
    name: 'Xbox Series',
    type: 'Gaming',
    category: 'Gaming',
    manufacturer: 'Microsoft',
  },
  {
    pattern: /Steam Deck/i,
    name: 'Steam Deck',
    type: 'Gaming',
    category: 'Gaming',
    manufacturer: 'Valve',
  },
  {
    pattern: /Valve (?!Index)/i,
    name: 'Valve',
    type: 'Gaming',
    category: 'Gaming',
    manufacturer: 'Valve',
  },
  {
    pattern: /Index Controller/i,
    name: 'Valve Index Controller',
    type: 'Controller',
    category: 'VR',
    manufacturer: 'Valve',
  },
  {
    pattern: /Index Headset/i,
    name: 'Valve Index',
    type: 'Headset',
    category: 'VR',
    manufacturer: 'Valve',
  },
  { pattern: /Quest/i, name: 'Meta Quest', type: 'Headset', category: 'VR', manufacturer: 'Meta' },
  {
    pattern: /Oculus/i,
    name: 'Meta/Oculus',
    type: 'Headset',
    category: 'VR',
    manufacturer: 'Meta',
  },
  { pattern: /VIVE/i, name: 'HTC Vive', type: 'Headset', category: 'VR', manufacturer: 'HTC' },
  {
    pattern: /VIVE Pro/i,
    name: 'HTC Vive Pro',
    type: 'Headset',
    category: 'VR',
    manufacturer: 'HTC',
  },
  { pattern: /Pico/i, name: 'Pico', type: 'Headset', category: 'VR', manufacturer: 'ByteDance' },
  {
    pattern: /Hololens/i,
    name: 'Microsoft HoloLens',
    type: 'Headset',
    category: 'VR',
    manufacturer: 'Microsoft',
  },
  {
    pattern: /Magic Leap/i,
    name: 'Magic Leap',
    type: 'Headset',
    category: 'VR',
    manufacturer: 'Magic Leap',
  },
  {
    pattern: /PSVR/i,
    name: 'PlayStation VR',
    type: 'Headset',
    category: 'VR',
    manufacturer: 'Sony',
  },
  {
    pattern: /PS VR/i,
    name: 'PlayStation VR',
    type: 'Headset',
    category: 'VR',
    manufacturer: 'Sony',
  },
  {
    pattern: /Wii Remote/i,
    name: 'Wii Remote',
    type: 'Controller',
    category: 'Gaming',
    manufacturer: 'Nintendo',
  },
  { pattern: /Wii/i, name: 'Wii', type: 'Gaming', category: 'Gaming', manufacturer: 'Nintendo' },
  {
    pattern: /Joy-Con/i,
    name: 'Joy-Con',
    type: 'Controller',
    category: 'Gaming',
    manufacturer: 'Nintendo',
  },
  {
    pattern: /Pro Controller/i,
    name: 'Switch Pro Controller',
    type: 'Controller',
    category: 'Gaming',
    manufacturer: 'Nintendo',
  },
  { pattern: /nreal/i, name: 'Nreal', type: 'Headset', category: 'AR', manufacturer: 'Nreal' },
  { pattern: /Rokid/i, name: 'Rokid', type: 'Headset', category: 'AR', manufacturer: 'Rokid' },
  { pattern: /Xreal/i, name: 'Xreal', type: 'Headset', category: 'AR', manufacturer: 'Xreal' },
  {
    pattern: /nubia Pad/i,
    name: 'nubia Pad',
    type: 'Tablet',
    category: 'Computing',
    manufacturer: 'nubia',
  },
  { pattern: /nubia/i, name: 'nubia', type: 'Phone', category: 'Computing', manufacturer: 'nubia' },
  {
    pattern: /REDMAGIC/i,
    name: 'REDMAGIC',
    type: 'Phone',
    category: 'Computing',
    manufacturer: 'nubia',
  },
  { pattern: /iPad/i, name: 'iPad', type: 'Tablet', category: 'Computing', manufacturer: 'Apple' },
  {
    pattern: /iPhone/i,
    name: 'iPhone',
    type: 'Phone',
    category: 'Computing',
    manufacturer: 'Apple',
  },
  {
    pattern: /iPod/i,
    name: 'iPod',
    type: 'Media Player',
    category: 'Audio',
    manufacturer: 'Apple',
  },
  {
    pattern: /MacBook/i,
    name: 'MacBook',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'Apple',
  },
  { pattern: /Mac/i, name: 'Mac', type: 'Desktop', category: 'Computing', manufacturer: 'Apple' },
  {
    pattern: /Pixel [0-9]/i,
    name: 'Google Pixel',
    type: 'Phone',
    category: 'Computing',
    manufacturer: 'Google',
  },
  {
    pattern: /Pixel (?!Watch|Book|Bods)/i,
    name: 'Google Pixel',
    type: 'Phone',
    category: 'Computing',
    manufacturer: 'Google',
  },
  {
    pattern: /Pixel Watch/i,
    name: 'Pixel Watch',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Google',
  },
  {
    pattern: /Pixel Buds/i,
    name: 'Pixel Buds',
    type: 'Earbuds',
    category: 'Audio',
    manufacturer: 'Google',
  },
  {
    pattern: /Pixelbook/i,
    name: 'Pixelbook',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'Google',
  },
  {
    pattern: /Surface/i,
    name: 'Surface',
    type: 'Tablet',
    category: 'Computing',
    manufacturer: 'Microsoft',
  },
  {
    pattern: /Dell.*Latitude/i,
    name: 'Dell Latitude',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'Dell',
  },
  {
    pattern: /Dell.*XPS/i,
    name: 'Dell XPS',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'Dell',
  },
  {
    pattern: /Dell.*Inspiron/i,
    name: 'Dell Inspiron',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'Dell',
  },
  {
    pattern: /Dell.*Precision/i,
    name: 'Dell Precision',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'Dell',
  },
  {
    pattern: /HP.*Spectre/i,
    name: 'HP Spectre',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'HP',
  },
  {
    pattern: /HP.*Envy/i,
    name: 'HP Envy',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'HP',
  },
  {
    pattern: /HP.*Pavilion/i,
    name: 'HP Pavilion',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'HP',
  },
  {
    pattern: /HP.*EliteBook/i,
    name: 'HP EliteBook',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'HP',
  },
  {
    pattern: /HP.*ZBook/i,
    name: 'HP ZBook',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'HP',
  },
  {
    pattern: /HP.*ThinkPad/i,
    name: 'HP ThinkPad',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'HP',
  },
  {
    pattern: /Lenovo.*ThinkPad/i,
    name: 'ThinkPad',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'Lenovo',
  },
  {
    pattern: /Lenovo.*Yoga/i,
    name: 'Lenovo Yoga',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'Lenovo',
  },
  {
    pattern: /Lenovo.*IdeaPad/i,
    name: 'Lenovo IdeaPad',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'Lenovo',
  },
  {
    pattern: /Lenovo.*Legion/i,
    name: 'Lenovo Legion',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'Lenovo',
  },
  {
    pattern: /Lenovo.*LOQ/i,
    name: 'Lenovo LOQ',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'Lenovo',
  },
  {
    pattern: /ASUS.*ROG/i,
    name: 'ASUS ROG',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'ASUS',
  },
  {
    pattern: /ASUS.*ZenBook/i,
    name: 'ASUS ZenBook',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'ASUS',
  },
  {
    pattern: /ASUS.*VivoBook/i,
    name: 'ASUS VivoBook',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'ASUS',
  },
  {
    pattern: /ASUS.*ProArt/i,
    name: 'ASUS ProArt',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'ASUS',
  },
  {
    pattern: /Acer.*Predator/i,
    name: 'Acer Predator',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'Acer',
  },
  {
    pattern: /Acer.*Aspire/i,
    name: 'Acer Aspire',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'Acer',
  },
  {
    pattern: /Acer.*Swift/i,
    name: 'Acer Swift',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'Acer',
  },
  {
    pattern: /MSI.*Raider/i,
    name: 'MSI Raider',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'MSI',
  },
  {
    pattern: /MSI.*Stealth/i,
    name: 'MSI Stealth',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'MSI',
  },
  {
    pattern: /MSI.*Creator/i,
    name: 'MSI Creator',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'MSI',
  },
  {
    pattern: /Razer.*Blade/i,
    name: 'Razer Blade',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'Razer',
  },
  {
    pattern: /Razer.*Stealth/i,
    name: 'Razer Blade Stealth',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'Razer',
  },
  {
    pattern: /Framework/i,
    name: 'Framework',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'Framework',
  },
  {
    pattern: /Framework.*16/i,
    name: 'Framework 16',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'Framework',
  },
  {
    pattern: /Framework.*13/i,
    name: 'Framework 13',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'Framework',
  },
  {
    pattern: /Framework.*Laptop/i,
    name: 'Framework Laptop',
    type: 'Laptop',
    category: 'Computing',
    manufacturer: 'Framework',
  },
  {
    pattern: /Pine64/i,
    name: 'Pine64',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'Pine64',
  },
  { pattern: /Pinecil/i, name: 'Pinecil', type: 'Tool', category: 'IoT', manufacturer: 'Pine64' },
  {
    pattern: /PineTime/i,
    name: 'PineTime',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Pine64',
  },
  {
    pattern: /Pinetime/i,
    name: 'PineTime',
    type: 'Smartwatch',
    category: 'Wearables',
    manufacturer: 'Pine64',
  },
  { pattern: /CrowPi/i, name: 'CrowPi', type: 'Dev Kit', category: 'IoT', manufacturer: 'Elecrow' },
  {
    pattern: /CrowVision/i,
    name: 'CrowVision',
    type: 'Display',
    category: 'IoT',
    manufacturer: 'Elecrow',
  },
  {
    pattern: /Pi Pico/i,
    name: 'Raspberry Pi Pico',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'Raspberry Pi',
  },
  {
    pattern: /Pico W/i,
    name: 'Raspberry Pi Pico W',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'Raspberry Pi',
  },
  {
    pattern: /Pi Zero/i,
    name: 'Raspberry Pi Zero',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'Raspberry Pi',
  },
  {
    pattern: /Raspberry Pi/i,
    name: 'Raspberry Pi',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'Raspberry Pi',
  },
  {
    pattern: /RPi/i,
    name: 'Raspberry Pi',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'Raspberry Pi',
  },
  {
    pattern: /M5Stick/i,
    name: 'M5Stick',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'M5Stack',
  },
  {
    pattern: /M5Stack/i,
    name: 'M5Stack',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'M5Stack',
  },
  {
    pattern: /M5Paper/i,
    name: 'M5Paper',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'M5Stack',
  },
  { pattern: /Atom/i, name: 'M5Atom', type: 'Dev Board', category: 'IoT', manufacturer: 'M5Stack' },
  {
    pattern: /CoreS3/i,
    name: 'M5Stack CoreS3',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'M5Stack',
  },
  {
    pattern: /Core2/i,
    name: 'M5Stack Core2',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'M5Stack',
  },
  {
    pattern: /Cardputer/i,
    name: 'M5Stack Cardputer',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'M5Stack',
  },
  {
    pattern: /StickC/i,
    name: 'M5StickC',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'M5Stack',
  },
  {
    pattern: /StickV/i,
    name: 'M5StickV',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'M5Stack',
  },
  {
    pattern: /UnitV/i,
    name: 'M5Stack UnitV',
    type: 'Dev Board',
    category: 'IoT',
    manufacturer: 'M5Stack',
  },
  {
    pattern: /TimedDoorbell/i,
    name: 'TimedDoorbell',
    type: 'Doorbell',
    category: 'IoT',
    manufacturer: 'Raspberry Pi',
  },
  {
    pattern: /Shelly/i,
    name: 'Shelly',
    type: 'Smart Switch',
    category: 'IoT',
    manufacturer: 'Shelly',
  },
  {
    pattern: /Sonoff/i,
    name: 'Sonoff',
    type: 'Smart Switch',
    category: 'IoT',
    manufacturer: 'Sonoff',
  },
  { pattern: /Tuya/i, name: 'Tuya', type: 'Smart Device', category: 'IoT', manufacturer: 'Tuya' },
  {
    pattern: /ewelink/i,
    name: 'eWeLink',
    type: 'Smart Device',
    category: 'IoT',
    manufacturer: 'eWeLink',
  },
  {
    pattern: /IKEA.*TRADFRI/i,
    name: 'IKEA TRÅDFRI',
    type: 'Smart Lights',
    category: 'IoT',
    manufacturer: 'IKEA',
  },
  {
    pattern: /TRADFRI/i,
    name: 'IKEA TRÅDFRI',
    type: 'Smart Lights',
    category: 'IoT',
    manufacturer: 'IKEA',
  },
  {
    pattern: /Sengled/i,
    name: 'Sengled',
    type: 'Smart Bulb',
    category: 'IoT',
    manufacturer: 'Sengled',
  },
  {
    pattern: /C by GE/i,
    name: 'C by GE',
    type: 'Smart Lights',
    category: 'IoT',
    manufacturer: 'GE',
  },
  { pattern: /Cync/i, name: 'Cync', type: 'Smart Lights', category: 'IoT', manufacturer: 'GE' },
  { pattern: /Innr/i, name: 'Innr', type: 'Smart Lights', category: 'IoT', manufacturer: 'Innr' },
  {
    pattern: /Insteon/i,
    name: 'Insteon',
    type: 'Smart Home',
    category: 'IoT',
    manufacturer: 'Insteon',
  },
  { pattern: / Wink/i, name: 'Wink', type: 'Hub', category: 'IoT', manufacturer: 'Wink' },
  { pattern: /WinkHub/i, name: 'Wink Hub', type: 'Hub', category: 'IoT', manufacturer: 'Wink' },
  {
    pattern: /SmartThings Hub/i,
    name: 'SmartThings Hub',
    type: 'Hub',
    category: 'IoT',
    manufacturer: 'Samsung',
  },
  { pattern: /Hubitat/i, name: 'Hubitat', type: 'Hub', category: 'IoT', manufacturer: 'Hubitat' },
  {
    pattern: /Home Assistant/i,
    name: 'Home Assistant',
    type: 'Hub',
    category: 'IoT',
    manufacturer: 'Home Assistant',
  },
  { pattern: /HomeKit/i, name: 'HomeKit', type: 'Hub', category: 'IoT', manufacturer: 'Apple' },
  { pattern: /AirPlay/i, name: 'AirPlay', type: 'Audio', category: 'Audio', manufacturer: 'Apple' },
  {
    pattern: /BLE/i,
    name: 'BLE Device',
    type: 'Unknown',
    category: 'Unknown',
    manufacturer: 'Generic',
  },
  {
    pattern: /Unknown/i,
    name: 'Unknown',
    type: 'Unknown',
    category: 'Unknown',
    manufacturer: 'Generic',
  },
];

export const BEACON_TYPES: Record<string, BeaconType> = {
  apple_ibeacon: {
    type: 'iBeacon',
    format: 'Apple iBeacon format (UUID + Major + Minor)',
  },
  eddystone_uid: {
    type: 'Eddystone UID',
    format: 'Google Eddystone UID (Namespace + Instance)',
  },
  eddystone_url: {
    type: 'Eddystone URL',
    format: 'Google Eddystone URL (compressed URL)',
  },
  eddystone_tlm: {
    type: 'Eddystone TLM',
    format: 'Google Eddystone TLM (Telemetry)',
  },
  eddystone_eid: {
    type: 'Eddystone EID',
    format: 'Google Eddystone EID (Ephemeral ID)',
  },
  altbeacon: {
    type: 'AltBeacon',
    format: 'Open Beacon format',
  },
  ruuvi: {
    type: 'RuuviTag',
    format: 'Environmental sensor data (temp, humidity, pressure, acceleration)',
  },
};

function hasServiceUuid(serviceUuids: string[], targetUuid: string): boolean {
  const normalizedTarget = targetUuid.toLowerCase().replace(/-/g, '');
  return serviceUuids.some((uuid) => {
    const aliases = buildServiceUuidAliases(uuid);
    return aliases.has(normalizedTarget);
  });
}

function hasIBeaconPrefix(data: DataView): boolean {
  return data.byteLength >= 2 && data.getUint8(0) === 0x02 && data.getUint8(1) === 0x15;
}

function getEddystoneFrameType(
  serviceData: Array<{ uuid: string; data: DataView }>
): number | null {
  for (const entry of serviceData) {
    if (!hasServiceUuid([entry.uuid], 'feaa')) {
      continue;
    }

    if (entry.data.byteLength > 0) {
      return entry.data.getUint8(0);
    }
  }

  return null;
}

function formatHexBytes(data: DataView, start: number, length: number): string {
  const bytes: string[] = [];
  for (let i = 0; i < length && start + i < data.byteLength; i++) {
    bytes.push(
      data
        .getUint8(start + i)
        .toString(16)
        .padStart(2, '0')
    );
  }
  return bytes.join('');
}

function toSignedByte(value: number): number {
  return value > 127 ? value - 256 : value;
}

function decodeEddystoneUrl(data: DataView): string | null {
  if (data.byteLength < 3) {
    return null;
  }

  const prefixes: Record<number, string> = {
    0x00: 'http://www.',
    0x01: 'https://www.',
    0x02: 'http://',
    0x03: 'https://',
  };

  const suffixes: Record<number, string> = {
    0x00: '.com/',
    0x01: '.org/',
    0x02: '.edu/',
    0x03: '.net/',
    0x04: '.info/',
    0x05: '.biz/',
    0x06: '.gov/',
    0x07: '.com',
    0x08: '.org',
    0x09: '.edu',
    0x0a: '.net',
    0x0b: '.info',
    0x0c: '.biz',
    0x0d: '.gov',
  };

  let url = prefixes[data.getUint8(2)] ?? '';

  for (let i = 3; i < data.byteLength; i++) {
    const value = data.getUint8(i);
    if (value in suffixes) {
      url += suffixes[value];
      continue;
    }

    url += String.fromCharCode(value);
  }

  return url || null;
}

function parseEddystoneDetails(serviceData: Array<{ uuid: string; data: DataView }>): string[] {
  for (const entry of serviceData) {
    if (!hasServiceUuid([entry.uuid], 'feaa')) {
      continue;
    }

    const data = entry.data;
    if (data.byteLength < 2) {
      continue;
    }

    const frameType = data.getUint8(0);
    const txPower = toSignedByte(data.getUint8(1));

    if (frameType === 0x00 && data.byteLength >= 18) {
      const namespace = formatHexBytes(data, 2, 10);
      const instance = formatHexBytes(data, 12, 6);
      return [`Tx ${txPower} dBm`, `Namespace ${namespace}`, `Instance ${instance}`];
    }

    if (frameType === 0x10 && data.byteLength >= 3) {
      const url = decodeEddystoneUrl(data);
      return url ? [`Tx ${txPower} dBm`, `URL ${url}`] : [`Tx ${txPower} dBm`];
    }

    if (frameType === 0x20 && data.byteLength >= 14) {
      const batteryMv = data.getUint16(2, false);
      const tempIntegral = toSignedByte(data.getUint8(4));
      const tempFraction = data.getUint8(5) / 256;
      const temperature = (tempIntegral + tempFraction).toFixed(2);
      const advCount = data.getUint32(6, false);
      return [`Battery ${batteryMv} mV`, `Temp ${temperature} C`, `Adv ${advCount}`];
    }

    if (frameType === 0x30 && data.byteLength >= 10) {
      const eid = formatHexBytes(data, 2, 8);
      return [`EID ${eid}`];
    }
  }

  return [];
}

function parseIBeaconDetails(data: DataView): string[] {
  if (data.byteLength < 23 || !hasIBeaconPrefix(data)) {
    return [];
  }

  const rawUuid = formatHexBytes(data, 2, 16);
  const uuid = `${rawUuid.slice(0, 8)}-${rawUuid.slice(8, 12)}-${rawUuid.slice(12, 16)}-${rawUuid.slice(16, 20)}-${rawUuid.slice(20, 32)}`;
  const major = data.getUint16(18, false);
  const minor = data.getUint16(20, false);
  const txPower = toSignedByte(data.getUint8(22));

  return [`UUID ${uuid}`, `Major ${major}`, `Minor ${minor}`, `Tx ${txPower} dBm`];
}

function parseAltBeaconDetails(data: DataView): string[] {
  if (data.byteLength < 24 || data.getUint8(0) !== 0xbe || data.getUint8(1) !== 0xac) {
    return [];
  }

  const beaconId = formatHexBytes(data, 2, 20);
  const refRssi = toSignedByte(data.getUint8(22));
  return [`ID ${beaconId}`, `Ref RSSI ${refRssi} dBm`];
}

function parseRuuviDetails(data: DataView): string[] {
  if (data.byteLength === 0) {
    return [];
  }

  const format = data.getUint8(0);
  const details = [`Format 0x${format.toString(16).padStart(2, '0')}`];

  if (format === 0x05 && data.byteLength >= 3) {
    const tempRaw = data.getInt16(1, false);
    details.push(`Temp ${(tempRaw * 0.005).toFixed(2)} C`);
  }

  return details;
}

function addDetectedBeacon(
  detected: Map<string, BeaconType>,
  key: keyof typeof BEACON_TYPES,
  details: string[] = []
): void {
  const base = BEACON_TYPES[key];
  if (!base) {
    return;
  }

  detected.set(key, {
    key,
    type: base.type,
    format: base.format,
    details,
  });
}

export function detectBeaconTypes(input: BeaconDetectionInput): BeaconType[] {
  const detected = new Map<string, BeaconType>();

  const usesEddystoneService = hasServiceUuid(input.serviceUuids, 'feaa');
  if (usesEddystoneService) {
    const frameType = getEddystoneFrameType(input.serviceData);
    const details = parseEddystoneDetails(input.serviceData);

    if (frameType === 0x00) addDetectedBeacon(detected, 'eddystone_uid', details);
    else if (frameType === 0x10) addDetectedBeacon(detected, 'eddystone_url', details);
    else if (frameType === 0x20) addDetectedBeacon(detected, 'eddystone_tlm', details);
    else if (frameType === 0x30) addDetectedBeacon(detected, 'eddystone_eid', details);
    else addDetectedBeacon(detected, 'eddystone_uid', details);
  }

  for (const entry of input.manufacturerData) {
    if (entry.id === 0x004c && hasIBeaconPrefix(entry.data)) {
      addDetectedBeacon(detected, 'apple_ibeacon', parseIBeaconDetails(entry.data));
    }

    if (entry.id === 0x0499) {
      addDetectedBeacon(detected, 'ruuvi', parseRuuviDetails(entry.data));
    }

    if (
      entry.data.byteLength >= 2 &&
      entry.data.getUint8(0) === 0xbe &&
      entry.data.getUint8(1) === 0xac
    ) {
      addDetectedBeacon(detected, 'altbeacon', parseAltBeaconDetails(entry.data));
    }
  }

  return Array.from(detected.values());
}

export function getDeviceInfo(deviceName: string): DevicePattern | null {
  if (!deviceName) return null;

  for (const pattern of DEVICE_PATTERNS) {
    if (pattern.pattern.test(deviceName)) {
      return pattern;
    }
  }
  return null;
}

export function getManufacturerName(manufacturerId: number): string | null {
  return MANUFACTURER_IDS[manufacturerId]?.name ?? null;
}

export function getServiceName(uuid: string): string | null {
  const normalized = uuid.toLowerCase().replace(/-/g, '');
  return SERVICE_UUIDS[normalized]?.name ?? null;
}
