import { defineHook } from 'eve/hooks';
export default defineHook({ events: {
  'turn.settled': (event, ctx) => { console.info(JSON.stringify({ event: 'turn_settled', sessionId: ctx.session.id, outcome: event.data.outcome })); },
  'session.ended': (_event, ctx) => { console.info(JSON.stringify({ event: 'session_ended', sessionId: ctx.session.id })); },
} });
