const responseFormatter = (req, res, next) => {
  res.formatResponse = (
    statusCode,
    success,
    message,
    data = null,
    extra = {}
  ) => {
    res.status(statusCode).json({
      success,
      message,
      data,
      ...extra,
    });
  };
  next();
};

module.exports = responseFormatter;
