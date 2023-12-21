import * as mapboxPolyline from '@mapbox/polyline';
import gcoord from 'gcoord';
import { WebMercatorViewport } from 'react-map-gl';
import { chinaGeojson } from 'src/static/run_countries';
import { chinaCities } from 'src/static/city';
import { MUNICIPALITY_CITIES_ARR, NEED_FIX_MAP, RUN_TITLES } from './const';

const titleForShow = (run) => {
  const date = run.start_date_local.slice(0, 11);
  const distance = (run.distance / 1000.0).toFixed(2);
  let name = 'Run';
  if (run.name.slice(0, 7) === 'Running') {
    name = 'run';
  }
  if (run.name) {
    name = run.name;
  }
  return `${name} ${date} ${distance} KM ${
    !run.summary_polyline ? '(No map data for this run)' : ''
  }`;
};

const formatPace = (d) => {
  if (Number.isNaN(d)) return '0';
  const pace = (1000.0 / 60.0) * (1.0 / d);
  const minutes = Math.floor(pace);
  const seconds = Math.floor((pace - minutes) * 60.0);
  return `${minutes}'${seconds.toFixed(0).toString().padStart(2, '0')}"`;
};

const convertMovingTime2Sec = (moving_time) => {
  if (!moving_time) {
    return 0;
  }
  // moving_time : '2 days, 12:34:56' or '12:34:56';
  const splits = moving_time.split(', ');
  const days = splits.length == 2 ? parseInt(splits[0]) : 0;
  const time = splits.splice(-1)[0];
  const [hours, minutes, seconds] = time.split(':').map(Number);
  const totalSeconds = ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
  return totalSeconds;
};

const formatRunTime = (moving_time) => {
  const totalSeconds = convertMovingTime2Sec(moving_time);
  const seconds = totalSeconds % 60;
  const minutes = (totalSeconds - seconds) / 60;
  if (minutes === 0) {
    return seconds + 's';
  }
  return minutes + 'min';
};

// for scroll to the map
const scrollToMap = () => {
  const el = document.querySelector('.fl.w-100.w-70-l');
  const rect = el.getBoundingClientRect();
  window.scroll(rect.left + window.scrollX, rect.top + window.scrollY);
};

const pattern = /([\u4e00-\u9fa5]{2,}(市|自治州))/g;
const extractLocations = (str) => {
  const locations = [];
  let match;
  
  while ((match = pattern.exec(str)) !== null) {
    locations.push(match[0]);
  }
  
  return locations;
};

const cities = chinaCities.map((c) => c.name);
// what about oversea?
const locationForRun = (run) => {
  let location = run.location_country;
  let [city, province, country] = ['', '', ''];
  if (location) {
    // Only for Chinese now
    // should fiter 臺灣
    const cityMatch = extractLocations(location);
    const provinceMatch = location.match(/[\u4e00-\u9fa5]{2,}(省|自治区)/);

    if (cityMatch) {
      [city] = cityMatch;
	    city = cities.find(value => cityMatch.includes(value));
	  
      if (!city) {
        city = '';
      }
    }
    if (provinceMatch) {
      [province] = provinceMatch;
    }
    const l = location.split(',');
    // or to handle keep location format
    let countryMatch = l[l.length - 1].match(
      /[\u4e00-\u9fa5].*[\u4e00-\u9fa5]/
    );
    if (!countryMatch && l.length >= 3) {
      countryMatch = l[2].match(/[\u4e00-\u9fa5].*[\u4e00-\u9fa5]/);
    }
    if (countryMatch) {
      [country] = countryMatch;
    }
  }
  if (MUNICIPALITY_CITIES_ARR.includes(city)) {
    province = city;
  }

  return { country, province, city };
};

const intComma = (x = '') => {
  if (x.toString().length <= 5) {
    return x;
  }
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
};

const pathForRun = (run) => {
  try {
    const c = mapboxPolyline.decode(run.summary_polyline);
    // reverse lat long for mapbox
    c.forEach((arr) => {
      [arr[0], arr[1]] = !NEED_FIX_MAP
        ? [arr[1], arr[0]]
        : gcoord.transform([arr[1], arr[0]], gcoord.GCJ02, gcoord.WGS84);
    });
    return c;
  } catch (err) {
    return [];
  }
};

const geoJsonForRuns = (runs) => ({
  type: 'FeatureCollection',
  features: runs.map((run) => {
    const points = pathForRun(run);
    if (!points) {
      return null;
    }

    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: points,
      },
    };
  }),
});

const geoJsonForMap = () => chinaGeojson;

const titleForRun = (run) => {
  const runDistance = run.distance / 1000;
  const runHour = +run.start_date_local.slice(11, 13);
  if (runDistance > 20 && runDistance < 40) {
    return RUN_TITLES.HALF_MARATHON_RUN_TITLE;
  }
  if (runDistance >= 40) {
    return RUN_TITLES.FULL_MARATHON_RUN_TITLE;
  }
  if (runHour >= 0 && runHour <= 10) {
    return RUN_TITLES.MORNING_RUN_TITLE;
  }
  if (runHour > 10 && runHour <= 14) {
    return RUN_TITLES.MIDDAY_RUN_TITLE;
  }
  if (runHour > 14 && runHour <= 18) {
    return RUN_TITLES.AFTERNOON_RUN_TITLE;
  }
  if (runHour > 18 && runHour <= 21) {
    return RUN_TITLES.EVENING_RUN_TITLE;
  }
  return RUN_TITLES.NIGHT_RUN_TITLE;
};

const applyToArray = (func, array) => func.apply(Math, array);
const getBoundsForGeoData = (geoData) => {
  const { features } = geoData;
  let points;
  // find first have data
  for (const f of features) {
    if (f.geometry.coordinates.length) {
      points = f.geometry.coordinates;
      break;
    }
  }
  if (!points) {
    return {};
  }
  // Calculate corner values of bounds
  const pointsLong = points.map((point) => point[0]);
  const pointsLat = points.map((point) => point[1]);
  const cornersLongLat = [
    [applyToArray(Math.min, pointsLong), applyToArray(Math.min, pointsLat)],
    [applyToArray(Math.max, pointsLong), applyToArray(Math.max, pointsLat)],
  ];
  const viewport = new WebMercatorViewport({
    width: 800,
    height: 600,
  }).fitBounds(cornersLongLat, { padding: 200 });
  let { longitude, latitude, zoom } = viewport;
  if (features.length > 1) {
    zoom = 11.5;
  }
  return { longitude, latitude, zoom };
};

const filterYearRuns = (run, year) => {
  if (run && run.start_date_local) {
    return run.start_date_local.slice(0, 4) === year;
  }
  return false;
};

const filterCityRuns = (run, city) => {
  if (run && run.location_country) {
    return run.location_country.includes(city);
  }
  return false;
};
const filterTitleRuns = (run, title) => titleForRun(run) === title;

const filterAndSortRuns = (activities, item, filterFunc, sortFunc) => {
  let s = activities;
  if (item !== 'Total') {
    s = activities.filter((run) => filterFunc(run, item));
  }
  return s.sort(sortFunc);
};

const sortDateFunc = (a, b) =>
  new Date(b.start_date_local.replace(' ', 'T')) -
  new Date(a.start_date_local.replace(' ', 'T'));
const sortDateFuncReverse = (a, b) => sortDateFunc(b, a);

export {
  titleForShow,
  formatPace,
  scrollToMap,
  locationForRun,
  intComma,
  pathForRun,
  geoJsonForRuns,
  geoJsonForMap,
  titleForRun,
  filterYearRuns,
  filterCityRuns,
  filterTitleRuns,
  filterAndSortRuns,
  sortDateFunc,
  sortDateFuncReverse,
  getBoundsForGeoData,
  formatRunTime,
  convertMovingTime2Sec,
};