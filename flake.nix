{
  description = "Hermes Desktop prompt refiner";

  inputs = {
    hermes.url = "github:NousResearch/hermes-agent/081e8d9b75b2bedae297a89232b04ef9be7b26a0";
    nixpkgs.follows = "hermes/nixpkgs";
  };

  outputs =
    {
      self,
      hermes,
      nixpkgs,
    }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
      python = pkgs.python314.withPackages (
        p:
        let
          pillow = p.pillow.overrideAttrs {
            version = "13.0.0";
            src = pkgs.fetchurl {
              url = "https://files.pythonhosted.org/packages/ce/a4/9cc30690a394a8305e8be4c9036aa16d0dfddadd09079860b582f562496d/pillow-13.0.0.tar.gz";
              hash = "sha256-zc0bolgXj3NW10FwyagbpOq2pdVXSLxAKloqb+a+NRA=";
            };
          };
        in
        if pillow.version == "13.0.0" then
          [ pillow ]
        else
          throw "prompt-refiner compatibility failure: Pillow must be 13.0.0, found ${pillow.version}"
      );
      tools = [
        python
        pkgs.nodejs_22
        pkgs.nixfmt
        pkgs.shfmt
        pkgs.shellcheck
        pkgs.coreutils
        hermes.packages.${system}.minimal
      ];
    in
    {
      devShells.${system}.default = pkgs.mkShell { packages = tools; };
      formatter.${system} = pkgs.nixfmt;
      packages.${system}.default = pkgs.runCommand "prompt-refiner-payload" { } ''
        dest="$out/share/hermes/plugins/prompt-refiner"
        mkdir -p "$dest/desktop"
        cp ${self}/plugin.yaml ${self}/__init__.py ${self}/refiner.py ${self}/UNLICENSE "$dest/"
        cp ${self}/desktop/plugin.js "$dest/desktop/plugin.js"
        printf '%s\n' '__init__.py' 'UNLICENSE' 'desktop/plugin.js' 'plugin.yaml' 'refiner.py' | LC_ALL=C sort > expected
        (cd "$dest" && find . -type f -printf '%P\n' | LC_ALL=C sort) > actual
        diff -u expected actual
      '';
      checks.${system}.offline =
        pkgs.runCommand "prompt-refiner-offline"
          {
            nativeBuildInputs = tools;
          }
          ''
            cp -R ${self}/. source
            chmod -R u+w source
            cd source
            bash scripts/check.sh
            touch "$out"
          '';
    };
}
