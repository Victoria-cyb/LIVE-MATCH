const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
  teams: [String],
  score: String,
  odds: {
    home: Number,
    draw: Number,
    away: Number,
  },
  time: String,
  sport: String,
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Match', matchSchema);