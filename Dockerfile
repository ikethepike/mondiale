FROM node:18-alpine
COPY . .
RUN npm run build
CMD ["npm", "start"]