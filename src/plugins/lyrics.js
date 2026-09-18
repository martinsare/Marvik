/**
 * Lyrics plugin
 */
import axios from 'axios';

export default {
  name: 'lyrics',
  description: 'Find lyrics for a song',
  version: '1.1.0',
  author: 'Are Martins',
  commands: [
    {
      name: 'lyrics',
      description: 'Find lyrics for a song',
      usage: '.lyrics <artist - song> or .lyrics <song name>',
      category: 'utils',
      ownerOnly: false,
      adminOnly: false,
      groupOnly: false,
      cooldown: 3,
      async execute(ctx) {
        const query = ctx.args.join(' ').trim();
        if (!query) return ctx.reply('Please provide a song name or artist and song.\n\nUsage: .lyrics Coldplay - Yellow\nOr: .lyrics Bohemian Rhapsody');
        
        let lyrics = null;
        let artist = '';
        let title = '';

        if (query.includes(' - ')) {
          const parts = query.split(' - ');
          artist = parts[0].trim();
          title = parts.slice(1).join(' - ').trim();
        } else if (query.includes('-')) {
          const parts = query.split('-');
          artist = parts[0].trim();
          title = parts.slice(1).join('-').trim();
        }

        try {
          if (artist && title) {
            const res = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`, { timeout: 10000 });
            if (res.data?.lyrics) {
              lyrics = res.data.lyrics;
            }
          }
          
          if (!lyrics) {
            // Try lyrics.ovh suggest API
            const suggestRes = await axios.get(`https://api.lyrics.ovh/suggest/${encodeURIComponent(query)}`, { timeout: 10000 });
            const firstResult = suggestRes.data?.data?.[0];
            if (firstResult?.artist?.name && firstResult?.title) {
              const res = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(firstResult.artist.name)}/${encodeURIComponent(firstResult.title)}`, { timeout: 10000 });
              if (res.data?.lyrics) {
                lyrics = `🎵 *${firstResult.artist.name} - ${firstResult.title}*\n\n${res.data.lyrics}`;
              }
            }
          }

          if (lyrics) {
            await ctx.reply(lyrics);
          } else {
            await ctx.reply('❌ Lyrics not found. Try searching with: .lyrics <artist> - <song name>');
          }
        } catch (error) {
          await ctx.reply('❌ Could not retrieve lyrics. Please try again or specify both artist and song title.');
        }
      }
    }
  ]
};

