const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src/ChatbotWidget.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'widget.js'
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'public', to: '' }
      ],
    }),
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, 'public'),
    },
    compress: true,
    port: 9000,
  }
};