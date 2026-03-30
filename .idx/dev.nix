{ pkgs, ... }: {
  channel = "stable-23.11";
  packages = [
    pkgs.nodejs_20
  ];
  idx = {
    extensions = [
      "ritwickdey.LiveServer"
    ];
    previews = {
      enable = true;
      previews = {
        web = {
          command = ["node" "server.js"];
          manager = "web";
        };
      };
    };
  };
}