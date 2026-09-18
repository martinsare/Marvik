/**
 * Weather plugin
 */
import axios from 'axios';

export default {
  name: 'weather',
  description: 'Get weather for a city',
  version: '1.1.0',
  author: 'Are Martins',
  commands: [
    {
      name: 'weather',
      description: 'Get weather for a city',
      usage: '.weather <city>',
      category: 'utils',
      ownerOnly: false,
      adminOnly: false,
      groupOnly: false,
      cooldown: 3,
      async execute(ctx) {
        if (!ctx.args[0]) return ctx.reply('Please provide a city name.\n\nUsage: .weather London');
        const city = ctx.args.join(' ');
        
        // Attempt 1: OpenWeatherMap
        try {
          const res = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=895284fb2d2c1d87a42248c0211bc2cb&units=metric`,
            { timeout: 8000 }
          );
          const data = res.data;
          const text = `☁️ *Weather in ${data.name}, ${data.sys?.country || ''}*
🌡️ *Temp:* ${Math.round(data.main.temp)}°C (Feels like: ${Math.round(data.main.feels_like)}°C)
💧 *Humidity:* ${data.main.humidity}%
🌬️ *Wind:* ${data.wind.speed} m/s
📝 *Condition:* ${data.weather[0]?.description || 'Clear'}`;
          return await ctx.reply(text);
        } catch {}

        // Attempt 2: wttr.in JSON format (free, no API key needed)
        try {
          const wttrRes = await axios.get(
            `https://wttr.in/${encodeURIComponent(city)}?format=j1`,
            { timeout: 8000, headers: { 'User-Agent': 'curl/7.88.1' } }
          );
          const current = wttrRes.data?.current_condition?.[0];
          const area = wttrRes.data?.nearest_area?.[0]?.areaName?.[0]?.value || city;
          const country = wttrRes.data?.nearest_area?.[0]?.country?.[0]?.value || '';

          if (current) {
            const text = `☁️ *Weather in ${area}${country ? `, ${country}` : ''}*
🌡️ *Temp:* ${current.temp_C}°C (Feels like: ${current.FeelsLikeC}°C)
💧 *Humidity:* ${current.humidity}%
🌬️ *Wind:* ${current.windspeedKmph} km/h
📝 *Condition:* ${current.weatherDesc?.[0]?.value || 'Clear'}`;
            return await ctx.reply(text);
          }
        } catch {}

        await ctx.reply('❌ City not found or weather service unavailable.');
      }
    }
  ]
};

